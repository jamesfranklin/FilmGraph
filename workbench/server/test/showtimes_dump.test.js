import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createSchema } from "../src/db.js";
import { ingestDump } from "../src/connectors/showtimes_dump.js";
import { venueId } from "../src/lib/venueId.js";

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

test("ingestDump preserves canonical Venue metadata (merge, not replace)", () => {
  const db = new Database(":memory:");
  createSchema(db);
  seedFilm(db, "film-111", 111, "Film A");

  // A dump venue ("Watershed", Bristol, GB) reconciles to this deterministic id,
  // which is also how the canonical seed Venue node is keyed. Seed it with rich
  // metadata the dump does NOT carry.
  const wid = venueId("Watershed", "Bristol", "GB");
  const canonical = {
    id: wid, name: "Watershed", city: "Bristol", country: "GB",
    address: "1 Canon's Road, Harbourside", website: "https://www.watershed.co.uk",
    latitude: 51.4499, longitude: -2.5975, is_independent: true,
  };
  db.prepare("INSERT INTO nodes (id, type, name, props) VALUES (?, 'Venue', ?, ?)")
    .run(wid, "Watershed", JSON.stringify(canonical));

  ingestDump(db, dump);

  // Canonical metadata must survive the ingest (not be clobbered to the sparse dump shape).
  const props = JSON.parse(db.prepare("SELECT props FROM nodes WHERE id = ?").get(wid).props);
  assert.equal(props.address, "1 Canon's Road, Harbourside");
  assert.equal(props.website, "https://www.watershed.co.uk");
  assert.equal(props.latitude, 51.4499);
  assert.equal(props.is_independent, true);

  // …and the exhibition edge was still written.
  const edge = db
    .prepare("SELECT COUNT(*) c FROM edges WHERE source_id='film-111' AND target_id=? AND type='EXHIBITED_AT'")
    .get(wid);
  assert.equal(edge.c, 1);
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
