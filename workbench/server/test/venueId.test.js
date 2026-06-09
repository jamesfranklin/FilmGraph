import { test } from "node:test";
import assert from "node:assert/strict";
import { venueId } from "../src/lib/venueId.js";

test("venueId is a deterministic RFC-4122 v5 UUID", () => {
  const a = venueId("Watershed", "Bristol", "gb");
  const b = venueId("  Watershed ", "Bristol", "GB"); // trimmed + upper country
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("different identity → different id", () => {
  assert.notEqual(venueId("Watershed", "Bristol", "GB"), venueId("Tyneside Cinema", "Newcastle", "GB"));
});
