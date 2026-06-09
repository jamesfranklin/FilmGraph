import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTimestamp } from "../src/connectors/assemble.js";

test("date range → start/end, high-ish fidelity", () => {
  const r = parseTimestamp("May 8 - May 14", 2025);
  assert.equal(r.start, "2025-05-08");
  assert.equal(r.end, "2025-05-14");
  assert.equal(r.fidelity, "range");
});

test("'March 1 only' → single day", () => {
  const r = parseTimestamp("March 1 only", 2025);
  assert.equal(r.start, "2025-03-01");
  assert.equal(r.end, "2025-03-01");
  assert.equal(r.fidelity, "day");
});

test("'Opens June 19' → open-ended from a date", () => {
  const r = parseTimestamp("Opens June 19", 2025);
  assert.equal(r.start, "2025-06-19");
  assert.equal(r.end, null);
  assert.equal(r.fidelity, "open");
});

test("'Now Playing' → no dates, lowest fidelity", () => {
  const r = parseTimestamp("Now Playing", 2025);
  assert.equal(r.start, null);
  assert.equal(r.fidelity, "none");
});

test("unparseable → null with 'none' fidelity", () => {
  const r = parseTimestamp("???", 2025);
  assert.equal(r.start, null);
  assert.equal(r.fidelity, "none");
});
