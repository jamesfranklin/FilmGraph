// Hand-edits made in the FilmGraph app (e.g. filling a missing TMDB id, the new
// MXID). These are *user* data, so they're persisted to a git-ignored overlay
// and re-applied after every reseed — a fingerprint-version bump must not lose
// them. The overlay is keyed by film id and stores only the changed fields.
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = process.env.FILMOS_EDITS_PATH || join(__dirname, "..", "data", "edits.local.json");

// Fields a user may edit, with how each maps onto the films table + Film node.
const EDITABLE = {
  title: { col: "title", prop: "title", type: "string" },
  year: { col: "year", prop: "year", type: "int" },
  runtime: { col: "runtime", prop: "runtime_mins", type: "int" },
  format: { col: "format", prop: "format", type: "string" },
  tmdb_id: { col: "tmdb_id", prop: "tmdb_id", type: "int" },
  mxid: { col: "mxid", prop: "mxid", type: "int" },
  subjects: { col: "subjects", prop: "subjects", type: "list" },
  countries: { col: "countries", prop: "origin_country", type: "list" },
};
export const EDITABLE_FIELDS = Object.keys(EDITABLE);

function load() {
  if (!existsSync(FILE)) return {};
  try {
    return JSON.parse(readFileSync(FILE, "utf8"));
  } catch {
    return {};
  }
}
function save(all) {
  mkdirSync(dirname(FILE), { recursive: true });
  const tmp = `${FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(all, null, 2));
  renameSync(tmp, FILE);
}

function coerce(type, v) {
  if (v === null || v === undefined || v === "") return null;
  if (type === "int") {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  }
  if (type === "list") return Array.isArray(v) ? v : String(v).split(",").map((s) => s.trim()).filter(Boolean);
  return String(v);
}

/** Record (or clear) edited fields for a film and persist the overlay. */
export function recordEdit(filmId, fields) {
  const all = load();
  const clean = {};
  for (const [k, v] of Object.entries(fields || {})) {
    if (!EDITABLE[k]) continue;
    clean[k] = coerce(EDITABLE[k].type, v);
  }
  all[filmId] = { ...(all[filmId] || {}), ...clean };
  save(all);
  return all[filmId];
}

/** Apply one film's edits to the live DB (films table + Film node props). */
export function applyEditToDb(db, filmId, fields) {
  const node = db.prepare("SELECT props FROM nodes WHERE id = ? AND type = 'Film'").get(filmId);
  const props = node ? JSON.parse(node.props) : null;
  const sets = [];
  const params = [];
  for (const [k, v] of Object.entries(fields || {})) {
    const def = EDITABLE[k];
    if (!def) continue;
    const value = coerce(def.type, v);
    sets.push(`${def.col} = ?`);
    params.push(def.type === "list" ? JSON.stringify(value || []) : value);
    if (props) props[def.prop] = value;
  }
  if (sets.length) {
    db.prepare(`UPDATE films SET ${sets.join(", ")} WHERE id = ?`).run(...params, filmId);
  }
  if (props) {
    db.prepare("UPDATE nodes SET props = ?, name = ? WHERE id = ?").run(
      JSON.stringify(props),
      props.title || null,
      filmId
    );
  }
}

/** How many films have stored edits (for the dataset/bundle view). */
export function editCount() {
  return Object.keys(load()).length;
}

/** Re-apply all stored edits to the DB (called by the seed loader). */
export function applyAllEdits(db) {
  const all = load();
  const ids = Object.keys(all);
  for (const id of ids) applyEditToDb(db, id, all[id]);
  return ids.length;
}
