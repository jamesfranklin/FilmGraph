import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createSchema } from "../src/db.js";
import { ingestDump } from "../src/connectors/showtimes_dump.js";
import { buildProfile } from "../src/profile.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dump = JSON.parse(readFileSync(join(__dirname, "fixtures", "dump.sample.json"), "utf8"));

test("buildProfile surfaces venueSeries from Film props", () => {
  const db = new Database(":memory:");
  createSchema(db);
  db.prepare("INSERT INTO films (id, tmdb_id, title) VALUES ('film-111', 111, 'Film A')").run();
  db.prepare("INSERT INTO nodes (id, type, name, props) VALUES ('film-111','Film','Film A',?)")
    .run(JSON.stringify({ title: "Film A" }));
  ingestDump(db, dump);

  const profile = buildProfile(db, "film-111");
  assert.deepEqual(profile.venueSeries.weeks, ["2025-W19", "2025-W20"]);
  assert.equal(profile.venues.length, 2); // existing EXHIBITED_AT read still works
});
