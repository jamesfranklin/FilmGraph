import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { filmVenueSeries } from "../src/showtimes/series.js";
import { venueId } from "../src/lib/venueId.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dump = JSON.parse(readFileSync(join(__dirname, "fixtures", "dump.sample.json"), "utf8"));

test("venue set aggregates sessions per venue with deterministic ids", () => {
  const a = filmVenueSeries(dump["111"].showtimes);
  const watershed = a.venues.find((v) => v.name === "Watershed");
  assert.equal(watershed.id, venueId("Watershed", "Bristol", "GB"));
  assert.equal(watershed.sessions, 3); // 3 Watershed showtimes
  assert.equal(a.venues.length, 2);
});

test("weekly series spans W19..W20 with venue + session channels", () => {
  const a = filmVenueSeries(dump["111"].showtimes);
  assert.deepEqual(a.series.weeks, ["2025-W19", "2025-W20"]);
  // W19: Watershed active (2 showtimes). W20: Watershed + Tyneside active (2 showtimes).
  assert.deepEqual(a.series.venuesRaw, [1, 2]);
  assert.deepEqual(a.series.sessionsRaw, [2, 2]);
  assert.deepEqual(a.series.venues, [0.5, 1]); // peak-normalised
});

test("aggregated {date, sessions} records are honoured", () => {
  const b = filmVenueSeries(dump["222"].showtimes);
  assert.deepEqual(b.series.weeks, ["2025-W19", "2025-W20"]);
  assert.deepEqual(b.series.sessionsRaw, [1, 1]);
  assert.equal(b.venues.length, 1);
});
