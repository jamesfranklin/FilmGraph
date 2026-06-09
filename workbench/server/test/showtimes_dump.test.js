import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createSchema } from "../src/db.js";
import { ingestDump } from "../src/connectors/showtimes_dump.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dump = JSON.parse(readFileSync(join(__dirname, "fixtures", "dump.sample.json"), "utf8"));

function seedFilm(db, id, tmdb, title) {
  db.prepare("INSERT INTO films (id, tmdb_id, title) VALUES (?, ?, ?)").run(id, tmdb, title);
  db.prepare("INSERT INTO nodes (id, type, name, props) VALUES (?, 'Film', ?, ?)")
    .run(id, title, JSON.stringify({ title }));
}

test("ingestDump writes venues, EXHIBITED_AT edges, and Film.venue_series", () => {
  const db = new Database(":memory:");
  createSchema(db);
  seedFilm(db, "film-111", 111, "Film A");

  const result = ingestDump(db, dump);
  assert.equal(result.filmsMatched, 1); // only tmdb 111 is in the corpus
  assert.equal(result.venues, 2);

  const edges = db.prepare("SELECT * FROM edges WHERE source_id = 'film-111' AND type = 'EXHIBITED_AT'").all();
  assert.equal(edges.length, 2);
  assert.equal(JSON.parse(edges[0].props).source, "dump");

  const props = JSON.parse(db.prepare("SELECT props FROM nodes WHERE id = 'film-111'").get().props);
  assert.deepEqual(props.venue_series.weeks, ["2025-W19", "2025-W20"]);
  assert.deepEqual(props.venue_series.venues, [0.5, 1]);
});

test("ingestDump is idempotent — re-running does not duplicate edges", () => {
  const db = new Database(":memory:");
  createSchema(db);
  seedFilm(db, "film-111", 111, "Film A");
  ingestDump(db, dump);
  ingestDump(db, dump);
  const edges = db.prepare("SELECT COUNT(*) c FROM edges WHERE source_id = 'film-111' AND type = 'EXHIBITED_AT'").get();
  assert.equal(edges.c, 2);
});
