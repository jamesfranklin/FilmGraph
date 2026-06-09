import { test } from "node:test";
import assert from "node:assert/strict";
import { peakNormalise } from "../src/showtimes/normalise.js";

test("scales to the series' own peak", () => {
  assert.deepEqual(peakNormalise([0, 10, 5]), [0, 1, 0.5]);
});

test("a flat zero series stays zero (no divide-by-zero)", () => {
  assert.deepEqual(peakNormalise([0, 0, 0]), [0, 0, 0]);
});

test("scale-invariance: same shape at different magnitudes normalises equal", () => {
  assert.deepEqual(peakNormalise([4, 40, 20]), peakNormalise([1, 10, 5]));
});
