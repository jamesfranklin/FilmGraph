import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parse } from "csv-parse/sync";
import { openDb, createSchema } from "./db.js";
import {
  slugify,
  splitCommas,
  splitList,
  parseCrew,
  parseFestivals,
  parseAwards,
  parsePurchaseLinks,
  toInt,
} from "./parse.js";
import { recomputeFingerprints } from "./profile.js";
import { applyAllEdits } from "./edits.js";
import { applyAllDistribution } from "./distribution.js";
import { replayFromCache } from "./connectors/replay.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "data");
const SEED = join(DATA, "seed");

function readJsonl(file) {
  const p = join(SEED, file);
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}
function readCsv(path) {
  return parse(readFileSync(path, "utf8"), { columns: true, skip_empty_lines: true, relax_quotes: true });
}

// Well-known documentary/film festivals → tier, for inferring tier on the many
// ad-hoc festival names in the corpus that aren't in the public festival list.
const KNOWN_TIERS = [
  [/(sundance|cannes|berlinale|berlin international|venice|toronto|tiff)/, "a_list"],
  [/(idfa|cph[: ]?dox|hot docs|sheffield|true\/?false|sxsw|tribeca|telluride|locarno|sundance|full frame|visions du r|dok leipzig|ji.?hlava|doclisboa|hotdocs|sunny side)/, "major"],
  [/(international|festival internacional|biff|doc|dox)/, "regional"],
];
function inferTier(name) {
  const n = name.toLowerCase();
  for (const [re, tier] of KNOWN_TIERS) if (re.test(n)) return tier;
  return "specialist";
}

const PLATFORM_MAP = [
  [/itunes|apple tv|apple/, { id: "apple-tv", name: "Apple TV", platform_type: "tvod" }],
  [/amazon|prime video/, { id: "amazon", name: "Amazon", platform_type: "tvod" }],
  [/netflix/, { id: "netflix", name: "Netflix", platform_type: "svod" }],
  [/mubi/, { id: "mubi", name: "MUBI", platform_type: "svod" }],
  [/vimeo/, { id: "vimeo", name: "Vimeo on Demand", platform_type: "tvod" }],
  [/youtube/, { id: "youtube", name: "YouTube", platform_type: "avod" }],
  [/google play/, { id: "google-play", name: "Google Play", platform_type: "tvod" }],
  [/kanopy/, { id: "kanopy", name: "Kanopy", platform_type: "educational" }],
  [/curzon|bfi player|dogwoof/, { id: "curzon", name: "Curzon Home Cinema", platform_type: "tvod" }],
];
function mapPlatform(name) {
  const n = (name || "").toLowerCase();
  for (const [re, p] of PLATFORM_MAP) if (re.test(n)) return p;
  return { id: slugify(name) || "other", name: name || "Other", platform_type: "tvod" };
}

function run() {
  const db = openDb();
  console.log("Creating schema…");
  createSchema(db);

  const insNode = db.prepare("INSERT OR IGNORE INTO nodes (id, type, name, props) VALUES (?, ?, ?, ?)");
  const insEdge = db.prepare("INSERT INTO edges (type, source_id, target_id, props) VALUES (?, ?, ?, ?)");
  const node = (id, type, name, props = {}) => insNode.run(id, type, name, JSON.stringify(props));
  const edge = (type, s, t, props = {}) => insEdge.run(type, s, t, JSON.stringify(props));

  // Node IDs here are human-readable slugs (e.g. `film-147`, `fest-sundance`)
  // rather than the UUIDs the FilmGraph v1 schema specifies. This is a
  // deliberate choice for the *local demo store* (the brief: "simplest local
  // store that works") — readable IDs make the API and debugging legible. The
  // production FilmGraph instance keys nodes by UUID; reference seed entities
  // loaded below keep their real UUIDs, and corpus-derived nodes get slugs.

  // Name → node-id lookups so corpus references reuse reference entities.
  const festByName = new Map();
  const funderByName = new Map();
  const distByName = new Map();
  const practByName = new Map();
  const norm = (s) => s.toLowerCase().replace(/\b(film festival|international|festival|the)\b/g, "").replace(/[^a-z0-9]/g, "").trim();

  const loadAll = db.transaction(() => {
    // --- reference entities from the public seed ---
    for (const f of readJsonl("funders.jsonl")) {
      node(f.id, "Organisation", f.name, f);
      funderByName.set(f.name.toLowerCase(), f.id);
    }
    for (const d of readJsonl("distributors.jsonl")) {
      node(d.id, "Distributor", d.name, d);
      distByName.set(d.name.toLowerCase(), d.id);
    }
    for (const p of readJsonl("practitioners.jsonl")) {
      node(p.id, "Practitioner", p.name, p);
      practByName.set(p.name.toLowerCase(), p.id);
    }
    for (const v of readJsonl("venues.jsonl")) node(v.id, "Venue", v.name, v);
    for (const b of readJsonl("award_bodies.jsonl")) node(b.id, "AwardBody", b.name, b);
    for (const c of readJsonl("award_categories.jsonl")) node(c.id, "AwardCategory", c.name, c);

    const festListPath = join(SEED, "festival_list.csv");
    if (existsSync(festListPath)) {
      for (const row of readCsv(festListPath)) {
        const id = `fest-${row.festival_id}`;
        node(id, "Festival", row.name, {
          id,
          name: row.name,
          city: row.city,
          country: row.country,
          tier: row.tier,
          festival_type: row.festival_type,
          website: row.website,
          founded_year: toInt(row.founded_year),
        });
        festByName.set(norm(row.name), id);
      }
    }

    // helpers that create-on-demand for corpus references
    const getFestival = (name) => {
      const key = norm(name);
      if (festByName.has(key)) return festByName.get(key);
      const id = `fest-${slugify(name)}`;
      const tier = inferTier(name);
      node(id, "Festival", name, { id, name, tier, festival_type: "documentary", _derived: true });
      festByName.set(key, id);
      return id;
    };
    const getFunder = (name) => {
      const key = name.toLowerCase();
      if (funderByName.has(key)) return funderByName.get(key);
      const id = `org-${slugify(name)}`;
      node(id, "Organisation", name, { id, name, type: "funding_body", _derived: true });
      funderByName.set(key, id);
      return id;
    };
    const getPractitioner = (name, role) => {
      const key = name.toLowerCase();
      if (practByName.has(key)) return practByName.get(key);
      const id = `pract-${slugify(name)}`;
      node(id, "Practitioner", name, { id, name, role: "filmmaker", craft_role: role, _derived: true });
      practByName.set(key, id);
      return id;
    };
    const platformSeen = new Set();
    const getPlatform = (rawName) => {
      const p = mapPlatform(rawName);
      const id = `plat-${p.id}`;
      if (!platformSeen.has(id)) {
        node(id, "Platform", p.name, { id: p.id, name: p.name, platform_type: p.platform_type });
        platformSeen.add(id);
      }
      return id;
    };

    // --- the film corpus ---
    const films = readCsv(join(DATA, "films_export_3.csv"));
    const insFilm = db.prepare(
      `INSERT INTO films (id, tmdb_id, slug, title, year, runtime, format, countries, subjects, completeness, fingerprint, trajectory)
       VALUES (@id,@tmdb_id,@slug,@title,@year,@runtime,@format,@countries,@subjects,@completeness,@fingerprint,@trajectory)`
    );
    const insFts = db.prepare("INSERT INTO films_fts (film_id, title, subjects, countries) VALUES (?,?,?,?)");

    for (const row of films) {
      if ((row.Status || "").toLowerCase() !== "published") continue;
      const filmId = `film-${row.ID}`;
      const countries = splitCommas(row.Countries);
      const subjects = splitCommas(row.Subjects);
      const funds = splitCommas(row.Funds);
      const sites = splitCommas(row.Sites);
      const goodpitches = splitCommas(row.Goodpitches);
      const crew = parseCrew(row["Crew (role:name; ...)"]);
      const festivals = parseFestivals(row["Festivals (festival:year:award:premiere; ...)"]);
      const awards = parseAwards(row["Awards (year:name:body; ...)"]);
      const purchases = parsePurchaseLinks(row["Purchase Links (country:name:url; ...)"]);

      node(filmId, "Film", row.Name, {
        id: filmId,
        docsociety_id: toInt(row.ID),
        tmdb_id: toInt(row.TMDB_ID),
        title: row.Name,
        slug: row.Slug,
        year: toInt(row.Year),
        runtime_mins: toInt(row.RuntimeMins),
        format: row.Format,
        origin_country: countries,
        subjects,
        sites,
        goodpitches,
        trailer: row.Trailer || null,
        website: splitCommas(row["Website Links"])[0] || null,
        featured: (row.Featured || "no").toLowerCase() === "yes",
      });

      // edges
      for (const f of festivals) {
        const fid = getFestival(f.name);
        edge("SCREENED_AT", filmId, fid, {
          year: f.year,
          premiere_status: f.premiere || undefined,
          award_won: f.award || undefined,
        });
      }
      for (const name of funds) {
        const oid = getFunder(name);
        edge("FUNDED", oid, filmId, { funding_type: "grant" });
      }
      for (const c of crew) {
        const pid = getPractitioner(c.name, c.role);
        edge("WORKED_ON", pid, filmId, { role: c.role });
      }
      for (const a of awards) {
        // Awards in this corpus are free-text; attach as a WON edge to an
        // ad-hoc AwardCategory node keyed by name.
        const acid = `award-${slugify(a.name)}`;
        node(acid, "AwardCategory", a.name, { id: acid, name: a.name, body: a.body || null, _derived: true });
        edge("WON", filmId, acid, { year: a.year, ceremony_year: a.year });
      }
      const availSeen = new Set();
      for (const p of purchases) {
        const platName = mapPlatform(p.name).name;
        const key = `${p.country}|${platName}`;
        if (availSeen.has(key)) continue;
        availSeen.add(key);
        const plid = getPlatform(p.name);
        edge("AVAILABLE_ON", filmId, plid, { territory: p.country, is_active: true, link_type: "tvod" });
      }
      for (const code of goodpitches) {
        // record participation as a lightweight edge to a Good Pitch org node
        node("org-good-pitch", "Organisation", "Good Pitch (Doc Society)", {
          id: "org-good-pitch", name: "Good Pitch (Doc Society)", type: "impact_org",
        });
        edge("PITCHED_AT", filmId, "org-good-pitch", { edition: code });
      }

      // Fingerprints are computed from the graph after loading (see below), so
      // the seed and the data connectors share one derivation path.
      insFilm.run({
        id: filmId,
        tmdb_id: toInt(row.TMDB_ID),
        slug: row.Slug,
        title: row.Name,
        year: toInt(row.Year),
        runtime: toInt(row.RuntimeMins),
        format: row.Format || null,
        countries: JSON.stringify(countries),
        subjects: JSON.stringify(subjects),
        completeness: 0,
        fingerprint: null,
        trajectory: null,
      });
      insFts.run(filmId, row.Name, subjects.join(" "), countries.join(" "));
    }
  });

  loadAll();
  const edited = applyAllEdits(db); // re-apply hand-edits (TMDB ids, MXID, …)
  if (edited) console.log(`Re-applied edits for ${edited} film(s).`);
  const distN = applyAllDistribution(db); // curated DISTRIBUTED_BY (CSV + overlay)
  if (distN) console.log(`Applied ${distN} distribution link(s).`);
  const replayed = replayFromCache(db); // restore connector enrichment from local cache
  if (replayed.tmdb || replayed.assemble || replayed.mrqe || replayed.boxoffice)
    console.log(
      `Replayed cache: TMDB=${replayed.tmdb} Assemble=${replayed.assemble} MRQE=${replayed.mrqe} BoxOffice=${replayed.boxoffice}`
    );
  console.log("Computing fingerprints…");
  recomputeFingerprints(db);

  const counts = {
    films: db.prepare("SELECT COUNT(*) c FROM films").get().c,
    nodes: db.prepare("SELECT COUNT(*) c FROM nodes").get().c,
    edges: db.prepare("SELECT COUNT(*) c FROM edges").get().c,
  };
  const byType = db.prepare("SELECT type, COUNT(*) c FROM nodes GROUP BY type ORDER BY c DESC").all();
  const byEdge = db.prepare("SELECT type, COUNT(*) c FROM edges GROUP BY type ORDER BY c DESC").all();
  console.log("Seed complete:", counts);
  console.log("Nodes:", byType.map((r) => `${r.type}=${r.c}`).join(" "));
  console.log("Edges:", byEdge.map((r) => `${r.type}=${r.c}`).join(" "));
  db.close();
}

run();
