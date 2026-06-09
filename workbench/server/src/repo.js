// Read queries over the local graph. Everything the API and the fingerprint
// engine need to assemble a film's connected entities.
import { openDb } from "./db.js";
import { applyEditToDb } from "./edits.js";
import { recomputeFingerprints } from "./profile.js";
import { addDistribution, removeDistribution } from "./distribution.js";

const db = openDb();

/** Add / remove a curated DISTRIBUTED_BY link for a film (FilmGraph editor). */
export function addFilmDistributor(tmdbId, fields) {
  return addDistribution(db, tmdbId, fields);
}
export function removeFilmDistributor(tmdbId, distributorId) {
  removeDistribution(db, tmdbId, distributorId);
}

/** The user-editable fields for a film (FilmGraph detail form). */
export function getEditable(id) {
  const f = db.prepare("SELECT * FROM films WHERE id = ?").get(id);
  if (!f) return null;
  return {
    title: f.title,
    year: f.year,
    runtime: f.runtime,
    format: f.format,
    tmdb_id: f.tmdb_id,
    mxid: f.mxid,
    subjects: JSON.parse(f.subjects),
    countries: JSON.parse(f.countries),
  };
}

/** Apply an edit to the live DB and recompute just that film's fingerprint. */
export function updateFilm(id, fields) {
  applyEditToDb(db, id, fields);
  recomputeFingerprints(db, [id]);
  return getEditable(id);
}

const props = (row) => (row ? JSON.parse(row.props) : null);

/** The fingerprint version stamped in the open DB (0 if never seeded). */
export function localDbVersion() {
  return db.pragma("user_version", { simple: true });
}

export function corpusCounts() {
  return {
    films: db.prepare("SELECT COUNT(*) c FROM films").get().c,
    nodes: db.prepare("SELECT COUNT(*) c FROM nodes").get().c,
    edges: db.prepare("SELECT COUNT(*) c FROM edges").get().c,
  };
}

export function nodeCountsByType() {
  return db.prepare("SELECT type, COUNT(*) c FROM nodes GROUP BY type ORDER BY c DESC").all();
}

// Turn free user input into a safe FTS5 MATCH expression. Each whitespace term
// is wrapped as a quoted string (so colons, hyphens and other FTS operators are
// treated literally rather than as column filters / syntax) and given a trailing
// '*' for search-as-you-type prefix matching. Returns null when there's nothing
// searchable.
function toFtsMatch(q) {
  const terms = q
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `"${t.replace(/"/g, '""')}"*`);
  return terms.length ? terms.join(" ") : null;
}

// Which edge an entity-group filter requires the film to have.
const GROUP_EDGE = {
  funder: { type: "FUNDED", dir: "target" }, // Organisation -> Film
  festival: { type: "SCREENED_AT", dir: "source" }, // Film -> Festival
  distributor: { type: "DISTRIBUTED_BY", dir: "source" }, // Film -> Distributor
};

/**
 * List/search films with optional filters:
 *  - `group`     — only films connected to a funder / festival / distributor.
 *  - `minDims`   — only films with at least N populated fingerprint dimensions
 *                  (i.e. N or more — 3 includes 3, 4, 5…). e.g. 3 for Compare.
 */
const DIMENSION_COUNT = 8; // completeness is present-dimensions / DIMENSION_COUNT
export function searchFilms({ q = "", page = 1, limit = 30, group = "", minDims = 0 }) {
  const offset = (page - 1) * limit;
  const where = [];
  const params = [];
  const match = q ? toFtsMatch(q) : null;

  let fromClause = "FROM films f";
  let order = "ORDER BY (f.year IS NULL), f.year DESC, f.title";
  if (match) {
    fromClause = "FROM films_fts x JOIN films f ON f.id = x.film_id";
    where.push("films_fts MATCH ?");
    params.push(match);
    order = "ORDER BY rank";
  }
  if (minDims > 0) {
    // Compare on the integer dimension count so "N or more" is exact.
    where.push(`ROUND(f.completeness * ${DIMENSION_COUNT}) >= ?`);
    params.push(minDims);
  }
  const g = GROUP_EDGE[group];
  if (g) {
    const col = g.dir === "target" ? "target_id" : "source_id";
    where.push(`EXISTS (SELECT 1 FROM edges e WHERE e.${col} = f.id AND e.type = '${g.type}')`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const items = db
    .prepare(`SELECT f.* ${fromClause} ${whereSql} ${order} LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);
  const total = db.prepare(`SELECT COUNT(*) c ${fromClause} ${whereSql}`).get(...params).c;
  return { items: items.map(filmListItem), total, page, limit };
}

function filmListItem(f) {
  return {
    id: f.id,
    tmdb_id: f.tmdb_id,
    title: f.title,
    year: f.year,
    format: f.format,
    runtime: f.runtime,
    countries: JSON.parse(f.countries),
    subjects: JSON.parse(f.subjects),
    completeness: f.completeness,
  };
}

export function getFilmRow(id) {
  return db.prepare("SELECT * FROM films WHERE id = ?").get(id);
}

export function getFilmFingerprint(id) {
  const row = db.prepare("SELECT fingerprint FROM films WHERE id = ?").get(id);
  return row ? JSON.parse(row.fingerprint) : null;
}
export function getFilmTrajectory(id) {
  const row = db.prepare("SELECT trajectory FROM films WHERE id = ?").get(id);
  return row ? JSON.parse(row.trajectory) : null;
}

export function allFingerprints() {
  return db
    .prepare("SELECT id, title, year, format, completeness, fingerprint FROM films")
    .all()
    .map((r) => ({ id: r.id, title: r.title, year: r.year, format: r.format, completeness: r.completeness, fp: JSON.parse(r.fingerprint) }));
}

/** A film's connected entities, grouped by relationship. */
export function filmConnections(id) {
  const festivals = db
    .prepare(
      `SELECT n.id, n.name, n.props, e.props AS edge FROM edges e JOIN nodes n ON n.id = e.target_id
       WHERE e.source_id = ? AND e.type = 'SCREENED_AT'`
    )
    .all(id)
    .map((r) => ({ id: r.id, name: r.name, ...props({ props: r.props }), screening: JSON.parse(r.edge) }))
    .sort((a, b) => (a.screening.year || 0) - (b.screening.year || 0));

  const funders = db
    .prepare(
      `SELECT n.id, n.name, n.props FROM edges e JOIN nodes n ON n.id = e.source_id
       WHERE e.target_id = ? AND e.type = 'FUNDED'`
    )
    .all(id)
    .map((r) => ({ id: r.id, name: r.name, ...props({ props: r.props }) }));

  const practitioners = db
    .prepare(
      `SELECT n.id, n.name, n.props, e.props AS edge FROM edges e JOIN nodes n ON n.id = e.source_id
       WHERE e.target_id = ? AND e.type = 'WORKED_ON'`
    )
    .all(id)
    .map((r) => ({ id: r.id, name: r.name, role: JSON.parse(r.edge).role, ...props({ props: r.props }) }));

  const awards = db
    .prepare(
      `SELECT n.id, n.name, n.props, e.props AS edge FROM edges e JOIN nodes n ON n.id = e.target_id
       WHERE e.source_id = ? AND e.type = 'WON'`
    )
    .all(id)
    .map((r) => ({ id: r.id, name: r.name, ...props({ props: r.props }), won: JSON.parse(r.edge) }));

  const availability = db
    .prepare(
      `SELECT n.id, n.name, n.props, e.props AS edge FROM edges e JOIN nodes n ON n.id = e.target_id
       WHERE e.source_id = ? AND e.type = 'AVAILABLE_ON'`
    )
    .all(id)
    .map((r) => ({ id: r.id, name: r.name, ...props({ props: r.props }), territory: JSON.parse(r.edge).territory }));

  const goodpitch = db
    .prepare(`SELECT e.props FROM edges e WHERE e.source_id = ? AND e.type = 'PITCHED_AT'`)
    .all(id)
    .map((r) => JSON.parse(r.props).edition);

  const distributors = db
    .prepare(
      `SELECT n.id, n.name, e.props AS edge FROM edges e JOIN nodes n ON n.id = e.target_id
       WHERE e.source_id = ? AND e.type = 'DISTRIBUTED_BY'`
    )
    .all(id)
    .map((r) => ({ id: r.id, name: r.name, ...JSON.parse(r.edge) }));

  return { festivals, funders, practitioners, awards, availability, goodpitch, distributors };
}

export function getNode(id) {
  const row = db.prepare("SELECT * FROM nodes WHERE id = ?").get(id);
  if (!row) return null;
  return { id: row.id, type: row.type, name: row.name, ...props(row) };
}

/** List nodes of a type (for Contacts), with how many films each connects to. */
export function listEntities(type, { q = "", limit = 400 } = {}) {
  const like = `%${q.toLowerCase()}%`;
  const rows = db
    .prepare(
      `SELECT n.id, n.name, n.type, n.props,
        (SELECT COUNT(*) FROM edges e WHERE e.source_id = n.id OR e.target_id = n.id) AS degree
       FROM nodes n WHERE n.type = ? AND (? = '' OR LOWER(n.name) LIKE ?)
       ORDER BY degree DESC, n.name LIMIT ?`
    )
    .all(type, q, like, limit);
  return rows.map((r) => ({ id: r.id, name: r.name, type: r.type, degree: r.degree, ...props(r) }));
}

/** Films connected to a node (either direction). */
export function filmsForNode(id) {
  const rows = db
    .prepare(
      `SELECT DISTINCT f.id, f.title, f.year, f.format FROM edges e
       JOIN films f ON f.id = CASE WHEN e.source_id = ? THEN e.target_id ELSE e.source_id END
       WHERE e.source_id = ? OR e.target_id = ?
       ORDER BY (f.year IS NULL), f.year DESC LIMIT 200`
    )
    .all(id, id, id);
  return rows;
}

export function corpusAggregates() {
  const fmt = db.prepare("SELECT format, COUNT(*) c FROM films GROUP BY format ORDER BY c DESC").all();
  const decade = db
    .prepare(
      `SELECT (year/10)*10 AS decade, COUNT(*) c FROM films WHERE year IS NOT NULL GROUP BY decade ORDER BY decade`
    )
    .all();
  const topFest = db
    .prepare(
      `SELECT n.name, COUNT(*) c FROM edges e JOIN nodes n ON n.id=e.target_id
       WHERE e.type='SCREENED_AT' GROUP BY n.id ORDER BY c DESC LIMIT 12`
    )
    .all();
  const topFunder = db
    .prepare(
      `SELECT n.name, COUNT(*) c FROM edges e JOIN nodes n ON n.id=e.source_id
       WHERE e.type='FUNDED' GROUP BY n.id ORDER BY c DESC LIMIT 12`
    )
    .all();
  const completeness = db.prepare("SELECT AVG(completeness) a FROM films").get().a;
  return { formats: fmt, decades: decade, topFestivals: topFest, topFunders: topFunder, avgCompleteness: completeness };
}
