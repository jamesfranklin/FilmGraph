import Database from "better-sqlite3";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Default to the repo's data dir; a packaged build points this at a writable
// app-data copy via FILMOS_DB_PATH (bundle resources are read-only).
export const DB_PATH = process.env.FILMOS_DB_PATH || join(__dirname, "..", "data", "filmos.db");

// Bump when the seed/fingerprint shape changes so stale local stores are
// auto-reseeded (dev) or re-copied from the bundle (packaged). Stamped into the
// SQLite header via PRAGMA user_version and read by the Tauri shell (lib.rs) —
// keep EXPECTED_FINGERPRINT_VERSION there in sync with this value.
export const FINGERPRINT_VERSION = 6;

export function openDb() {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

/** Drop + recreate the local graph store. Called by the seed loader. */
export function createSchema(db) {
  db.exec(`
    DROP TABLE IF EXISTS nodes;
    DROP TABLE IF EXISTS edges;
    DROP TABLE IF EXISTS films;
    DROP TABLE IF EXISTS films_fts;

    -- Generic property graph, mirroring the FilmGraph node/edge model.
    CREATE TABLE nodes (
      id    TEXT PRIMARY KEY,
      type  TEXT NOT NULL,
      name  TEXT,
      props TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX idx_nodes_type ON nodes(type);
    CREATE INDEX idx_nodes_name ON nodes(name);

    CREATE TABLE edges (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      type      TEXT NOT NULL,
      source_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      props     TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX idx_edges_src  ON edges(source_id, type);
    CREATE INDEX idx_edges_tgt  ON edges(target_id, type);
    CREATE INDEX idx_edges_type ON edges(type);

    -- Convenience table for the film corpus: fast listing + fingerprint cache.
    CREATE TABLE films (
      id          TEXT PRIMARY KEY,
      tmdb_id     INTEGER,
      mxid        INTEGER,
      slug        TEXT,
      title       TEXT NOT NULL,
      year        INTEGER,
      runtime     INTEGER,
      format      TEXT,
      countries   TEXT NOT NULL DEFAULT '[]',
      subjects    TEXT NOT NULL DEFAULT '[]',
      completeness REAL NOT NULL DEFAULT 0,
      fingerprint TEXT,
      trajectory  TEXT
    );
    CREATE INDEX idx_films_year ON films(year);

    -- Standalone FTS index, populated directly by the seed loader.
    CREATE VIRTUAL TABLE films_fts USING fts5(
      film_id UNINDEXED, title, subjects, countries
    );
  `);
  // Stamp the fingerprint version into the DB header for upgrade detection.
  db.pragma(`user_version = ${FINGERPRINT_VERSION}`);
}

/** The fingerprint version stamped in this DB (0 if never seeded). */
export function dbVersion(db) {
  return db.pragma("user_version", { simple: true });
}
