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

test("records with no usable date or no venue are dropped and excluded", () => {
  const r = filmVenueSeries([
    { venue: { name: "X", city: "Y", country: "GB" }, datetime: "nonsense" },
    { venue: { name: "X", city: "Y", country: "GB" } },           // no date
    { date: "2025-05-08", sessions: 1 },                            // no venue
    { venue: { name: "X", city: "Y", country: "GB" }, date: "2025-05-08" },
  ]);
  assert.equal(r.dropped, 3);
  assert.deepEqual(r.series.weeks, ["2025-W19"]);
  assert.equal(r.venues.length, 1);
});

test("gap weeks inside the span are zero-filled", () => {
  const r = filmVenueSeries([
    { venue: { name: "X", city: "Y", country: "GB" }, date: "2025-05-08" }, // W19
    { venue: { name: "X", city: "Y", country: "GB" }, date: "2025-05-22" }, // W21
  ]);
  assert.deepEqual(r.series.weeks, ["2025-W19", "2025-W20", "2025-W21"]);
  assert.deepEqual(r.series.venuesRaw, [1, 0, 1]);
});

test("evening datetime bins by calendar date regardless of timezone", () => {
  // 2025-05-11 is a Sunday → ISO week 2025-W19. The naive evening time must not
  // roll it into W20 under a western timezone.
  const r = filmVenueSeries([
    { venue: { name: "X", city: "Y", country: "GB" }, datetime: "2025-05-11T23:30:00" },
  ]);
  assert.deepEqual(r.series.weeks, ["2025-W19"]);
});
