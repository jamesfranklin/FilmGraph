/** Scale a numeric channel to [0,1] against its own peak. Empty/zero → zeros. */
export function peakNormalise(values) {
  const peak = Math.max(0, ...values);
  if (peak === 0) return values.map(() => 0);
  return values.map((v) => v / peak);
}
