// Distribution links (DISTRIBUTED_BY). There's no API for this, so it's hand
// curated in two complementary ways:
//   - server/data/distribution.csv      — committed bulk curation (part of the
//                                          downloadable seed bundle).
//   - server/data/distribution.local.json — per-install edits made in FilmGraph
//                                          (git-ignored), re-applied after reseed.
// All rows key the film by TMDB id.
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parse } from "csv-parse/sync";
import { makeGraph } from "./connectors/http.js";
import { slugify } from "./parse.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "data");
const CSV = join(DATA, "distribution.csv");
const OVERLAY = process.env.FILMOS_DISTRIBUTION_PATH || join(DATA, "distribution.local.json");

function loadOverlay() {
  if (!existsSync(OVERLAY)) return [];
  try {
    return JSON.parse(readFileSync(OVERLAY, "utf8"));
  } catch {
    return [];
  }
}
function saveOverlay(rows) {
  mkdirSync(dirname(OVERLAY), { recursive: true });
  const tmp = `${OVERLAY}.tmp`;
  writeFileSync(tmp, JSON.stringify(rows, null, 2));
  renameSync(tmp, OVERLAY);
}

// Find an existing Distributor node by name (case-insensitive) or create one.
function upsertDistributor(db, name) {
  const row = db.prepare("SELECT id FROM nodes WHERE type = 'Distributor' AND LOWER(name) = LOWER(?)").get(name);
  if (row) return row.id;
  const id = `dist-${slugify(name)}`;
  db.prepare("INSERT OR IGNORE INTO nodes (id, type, name, props) VALUES (?, 'Distributor', ?, ?)").run(
    id,
    name,
    JSON.stringify({ id, name, type: "indie", _source: "curated" })
  );
  return id;
}

/** Apply one distribution row (by tmdb_id) as a DISTRIBUTED_BY edge. */
export function applyDistributionRow(db, row) {
  if (!row || row.tmdb_id == null || !row.distributor) return false;
  const film = db.prepare("SELECT id FROM films WHERE tmdb_id = ?").get(Number(row.tmdb_id));
  if (!film) return false;
  const g = makeGraph(db);
  const distId = upsertDistributor(db, row.distributor);
  g.edge("DISTRIBUTED_BY", film.id, distId, {
    territory: row.territory || null,
    deal_type: row.deal_type || null,
    release_date: row.release_date || null,
  });
  return true;
}

/** Load committed CSV + the local overlay into DISTRIBUTED_BY edges. */
export function applyAllDistribution(db) {
  let n = 0;
  if (existsSync(CSV)) {
    const rows = parse(readFileSync(CSV, "utf8"), { columns: true, skip_empty_lines: true, trim: true });
    for (const r of rows) if (applyDistributionRow(db, r)) n++;
  }
  for (const r of loadOverlay()) if (applyDistributionRow(db, r)) n++;
  return n;
}

// ---- in-app editing (writes the overlay + the live graph) ----
export function addDistribution(db, tmdbId, fields) {
  const row = {
    tmdb_id: Number(tmdbId),
    distributor: String(fields.distributor || "").trim(),
    territory: fields.territory || null,
    deal_type: fields.deal_type || null,
  };
  if (!row.distributor) throw new Error("distributor name required");
  const rows = loadOverlay().filter(
    (r) => !(Number(r.tmdb_id) === row.tmdb_id && r.distributor.toLowerCase() === row.distributor.toLowerCase())
  );
  rows.push(row);
  saveOverlay(rows);
  applyDistributionRow(db, row);
  return row;
}

export function removeDistribution(db, tmdbId, distributorId) {
  // Drop the edge from the live graph.
  const film = db.prepare("SELECT id FROM films WHERE tmdb_id = ?").get(Number(tmdbId));
  if (film) {
    db.prepare("DELETE FROM edges WHERE source_id = ? AND target_id = ? AND type = 'DISTRIBUTED_BY'").run(
      film.id,
      distributorId
    );
  }
  // Drop matching overlay rows (match the distributor node id by slug/name).
  const node = db.prepare("SELECT name FROM nodes WHERE id = ?").get(distributorId);
  const name = node?.name?.toLowerCase();
  const rows = loadOverlay().filter(
    (r) => !(Number(r.tmdb_id) === Number(tmdbId) && r.distributor.toLowerCase() === name)
  );
  saveOverlay(rows);
}

export function distributionCounts() {
  let csv = 0;
  if (existsSync(CSV)) csv = parse(readFileSync(CSV, "utf8"), { columns: true, skip_empty_lines: true }).length;
  return { csv, overlay: loadOverlay().length };
}
