import { test } from "node:test";
import assert from "node:assert/strict";
import { isoWeekKey, weekRange } from "../src/lib/isoweek.js";

test("isoWeekKey returns YYYY-Www", () => {
  assert.equal(isoWeekKey(new Date("2025-05-08T19:30:00Z")), "2025-W19");
  assert.equal(isoWeekKey(new Date("2025-05-12T10:00:00Z")), "2025-W20"); // Monday rolls the week
});

test("weekRange enumerates inclusive consecutive week keys", () => {
  assert.deepEqual(weekRange("2025-W19", "2025-W21"), ["2025-W19", "2025-W20", "2025-W21"]);
});

test("weekRange spans a year boundary", () => {
  assert.equal(weekRange("2024-W52", "2025-W01")[0], "2024-W52");
  assert.ok(weekRange("2024-W52", "2025-W01").includes("2025-W01"));
});
