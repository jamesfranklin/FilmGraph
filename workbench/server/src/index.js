import express from "express";
import { existsSync } from "node:fs";
import { DB_PATH, FINGERPRINT_VERSION } from "./db.js";
import {
  corpusCounts,
  nodeCountsByType,
  searchFilms,
  getFilmRow,
  getFilmFingerprint,
  getFilmTrajectory,
  allFingerprints,
  filmConnections,
  getNode,
  listEntities,
  filmsForNode,
  corpusAggregates,
  localDbVersion,
  getEditable,
  updateFilm,
  addFilmDistributor,
  removeFilmDistributor,
} from "./repo.js";
import { recordEdit, editCount } from "./edits.js";
import { distributionCounts } from "./distribution.js";
import { cacheCounts } from "./connectors/cache.js";
import {
  similarity,
  genreSimilarity,
  deserialiseFingerprint,
  DIMENSIONS,
  PHASES,
  DEFAULT_WEIGHTS,
} from "./fingerprint.js";
import { buildQuestions } from "./questions.js";
import { listStorage, previewFile } from "./storage.js";
import { listConnectors, getStatus, configure, startRun } from "./connectors/index.js";

const SCHEMA_VERSION = "1.0.0";
const PORT = process.env.FILMOS_API_PORT || 4317;

if (!existsSync(DB_PATH)) {
  console.error(`\nNo local graph found at ${DB_PATH}.\nRun  npm run seed  first.\n`);
  process.exit(1);
}

// The Tauri shell auto-reseeds a stale DB; the plain `npm run dev` path can't, so
// warn loudly if the store predates the current fingerprint shape.
if (localDbVersion() !== FINGERPRINT_VERSION) {
  console.warn(
    `\n[FilmOS] Local graph is v${localDbVersion()} but this build expects v${FINGERPRINT_VERSION}.\n` +
      `         Matches may be wrong — run  npm run seed  to rebuild it.\n`
  );
}

const app = express();
app.use(express.json());

// The server only ever binds to localhost. Allow cross-origin reads/writes so
// the packaged Tauri webview (served from the app's asset origin) can reach it —
// including the JSON POSTs, which trigger an OPTIONS preflight.
app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const ok = (res, data) => res.json({ schema_version: SCHEMA_VERSION, data });
const notFound = (res, what) => res.status(404).json({ schema_version: SCHEMA_VERSION, error: `${what} not found` });

// ---------- meta ----------
app.get("/api", (_req, res) =>
  ok(res, { name: "FilmOS local graph", schema_version: SCHEMA_VERSION, ...corpusCounts(), local: true })
);
app.get("/api/schema", (_req, res) =>
  ok(res, { version: SCHEMA_VERSION, dimensions: DIMENSIONS, phases: PHASES, nodes: nodeCountsByType() })
);

// ---------- films ----------
app.get("/api/films", (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(1000, parseInt(req.query.limit) || 30);
  ok(
    res,
    searchFilms({
      q: req.query.q || "",
      page,
      limit,
      group: req.query.group || "",
      minDims: parseInt(req.query.minDims) || 0,
    })
  );
});

app.get("/api/films/:id", (req, res) => {
  const row = getFilmRow(req.params.id);
  if (!row) return notFound(res, "Film");
  const node = getNode(req.params.id);
  ok(res, {
    film: node,
    completeness: row.completeness,
    connections: filmConnections(req.params.id),
    editable: getEditable(req.params.id),
  });
});

// Edit a film's core fields (FilmGraph). Persisted to the local overlay so the
// edit survives a reseed, then applied to the live graph + fingerprint.
app.post("/api/films/:id", (req, res) => {
  const row = getFilmRow(req.params.id);
  if (!row) return notFound(res, "Film");
  recordEdit(req.params.id, req.body || {});
  const editable = updateFilm(req.params.id, req.body || {});
  ok(res, { editable });
});

// Curated distribution links (DISTRIBUTED_BY). Keys off the film's TMDB id.
app.post("/api/films/:id/distributors", (req, res) => {
  const row = getFilmRow(req.params.id);
  if (!row) return notFound(res, "Film");
  if (row.tmdb_id == null) {
    return res.status(400).json({ schema_version: SCHEMA_VERSION, error: "Set a TMDB id first — distribution keys off it." });
  }
  try {
    addFilmDistributor(row.tmdb_id, req.body || {});
    ok(res, { connections: filmConnections(req.params.id) });
  } catch (e) {
    res.status(400).json({ schema_version: SCHEMA_VERSION, error: String(e.message || e) });
  }
});
app.delete("/api/films/:id/distributors/:distId", (req, res) => {
  const row = getFilmRow(req.params.id);
  if (!row) return notFound(res, "Film");
  removeFilmDistributor(row.tmdb_id, req.params.distId);
  ok(res, { connections: filmConnections(req.params.id) });
});

app.get("/api/films/:id/trajectory", (req, res) => {
  const traj = getFilmTrajectory(req.params.id);
  if (!traj) return notFound(res, "Film");
  const row = getFilmRow(req.params.id);
  ok(res, { film: { id: row.id, title: row.title, year: row.year }, completeness: row.completeness, trajectory: traj });
});

// The comparables engine.
app.get("/api/films/:id/similar", (req, res) => {
  const targetStored = getFilmFingerprint(req.params.id);
  if (!targetStored) return notFound(res, "Film");
  const targetRow = getFilmRow(req.params.id);
  const limit = Math.min(50, parseInt(req.query.limit) || 8);
  const weights = parseWeights(req.query.weights);

  const target = deserialiseFingerprint(targetStored);

  // Score every other film on both axes in a single pass. We keep zero-overlap
  // films too, because the genre contrast must be free to surface films that
  // share *no* trajectory dimension — that's the whole point of the contrast.
  const scored = [];
  for (const cand of allFingerprints()) {
    if (cand.id === req.params.id) continue;
    const fp = deserialiseFingerprint(cand.fp);
    const sim = similarity(target, fp, weights);
    scored.push({
      id: cand.id,
      title: cand.title,
      year: cand.year,
      format: cand.format,
      completeness: cand.completeness,
      score: sim.score,
      adjustedScore: sim.adjustedScore,
      sharedDimensions: sim.sharedDimensions,
      confidence: sim.confidence,
      contributions: sim.contributions,
      genreScore: genreSimilarity(target, fp),
    });
  }

  // Trajectory comparables: only films sharing a dimension, ranked by the
  // breadth-adjusted score so a broad match outranks a narrow "perfect" one.
  const comparables = scored
    .filter((c) => c.sharedDimensions > 0)
    .sort((a, b) => b.adjustedScore - a.adjustedScore)
    .slice(0, limit)
    .map((c) => ({ ...c, trajectory: getFilmTrajectory(c.id) })); // fetch shapes only for what we return

  // Contrast: a genre/subject-only ranking over the whole corpus.
  const genreComparables = [...scored]
    .sort((a, b) => b.genreScore - a.genreScore)
    .slice(0, limit)
    .map((c) => ({ id: c.id, title: c.title, year: c.year, genreScore: c.genreScore, score: c.score }));

  ok(res, {
    film: { id: targetRow.id, title: targetRow.title, year: targetRow.year, completeness: targetRow.completeness },
    weights,
    dimensionCount: DIMENSIONS.length,
    targetTrajectory: getFilmTrajectory(req.params.id),
    comparables,
    genreComparables,
  });
});

// The three question types.
app.get("/api/films/:id/questions", (req, res) => {
  const targetStored = getFilmFingerprint(req.params.id);
  if (!targetStored) return notFound(res, "Film");
  const targetRow = getFilmRow(req.params.id);
  const target = deserialiseFingerprint(targetStored);
  const weights = parseWeights(req.query.weights);

  const ranked = [];
  for (const cand of allFingerprints()) {
    if (cand.id === req.params.id) continue;
    const sim = similarity(target, deserialiseFingerprint(cand.fp), weights);
    if (sim.sharedDimensions === 0) continue;
    ranked.push({ id: cand.id, title: cand.title, year: cand.year, score: sim.score });
  }
  ranked.sort((a, b) => b.score - a.score);
  const comparableIds = ranked.slice(0, 25).filter((r) => r.score > 0.1).map((r) => r.id);

  ok(res, buildQuestions(targetRow, comparableIds, { filmConnections, corpusAggregates }));
});

// ---------- entities (Contacts / graph browse) ----------
app.get("/api/entities/:type", (req, res) => {
  ok(res, { items: listEntities(req.params.type, { q: req.query.q || "" }) });
});
app.get("/api/node/:id", (req, res) => {
  const node = getNode(req.params.id);
  if (!node) return notFound(res, "Node");
  ok(res, { node, films: filmsForNode(req.params.id) });
});

// ---------- local file storage (Finder) ----------
app.get("/api/storage", (_req, res) => ok(res, { locations: listStorage() }));
app.get("/api/storage/file", (req, res) => {
  const preview = previewFile(req.query.folder, req.query.name);
  if (!preview) return notFound(res, "File");
  ok(res, preview);
});

// ---------- AppStore data connectors ----------
app.get("/api/connectors", (_req, res) => ok(res, { connectors: listConnectors() }));
app.post("/api/connectors/:id/config", (req, res) => {
  try {
    ok(res, configure(req.params.id, (req.body && req.body.apiKey) || null));
  } catch (e) {
    res.status(400).json({ schema_version: SCHEMA_VERSION, error: String(e.message || e) });
  }
});
app.post("/api/connectors/:id/run", (req, res) => {
  try {
    ok(res, startRun(req.params.id, { limit: req.body && req.body.limit }));
  } catch (e) {
    res.status(400).json({ schema_version: SCHEMA_VERSION, error: String(e.message || e) });
  }
});
app.get("/api/connectors/:id/status", (req, res) => ok(res, getStatus(req.params.id)));

// ---------- dataset bundle (Settings) ----------
// The seed is a layered bundle: a public spine + curated relationships, a
// privately-shareable connector cache, and the user's personal edit overlays.
app.get("/api/bundle", (_req, res) => {
  const counts = corpusCounts();
  ok(res, {
    schema_version: SCHEMA_VERSION,
    fingerprint_version: FINGERPRINT_VERSION,
    layers: {
      public: {
        label: "Public — spine + curated relationships",
        shareable: "git / open",
        films: counts.films,
        distribution_rows: distributionCounts().csv,
      },
      restricted: {
        label: "Restricted — connector cache (private share)",
        shareable: "private only (TMDB ToS)",
        cache: cacheCounts(),
      },
      personal: {
        label: "Personal — your edits",
        shareable: "yours",
        field_edits: editCount(),
        distribution_edits: distributionCounts().overlay,
      },
    },
  });
});

// ---------- corpus stats ----------
app.get("/api/stats", (_req, res) => ok(res, { ...corpusCounts(), ...corpusAggregates(), nodeCounts: nodeCountsByType() }));

function parseWeights(raw) {
  if (!raw) return DEFAULT_WEIGHTS;
  try {
    return { ...DEFAULT_WEIGHTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_WEIGHTS;
  }
}

app.listen(PORT, "127.0.0.1", () => {
  const c = corpusCounts();
  console.log(`FilmOS local API on http://127.0.0.1:${PORT}  (${c.films} films, ${c.edges} edges)`);
});
