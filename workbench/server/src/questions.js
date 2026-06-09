// The three question types FilmOS answers against a film's comparable set.
// All answers are grounded in data the corpus actually has — no fabricated
// economics / P&A where the dimension is absent.

function tally(items, keyFn) {
  const m = new Map();
  for (const it of items) {
    const k = keyFn(it);
    if (!k) continue;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}
function range(nums) {
  const xs = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!xs.length) return null;
  const median = xs[Math.floor(xs.length / 2)];
  return { min: xs[0], max: xs[xs.length - 1], median, n: xs.length };
}

export function buildQuestions(targetRow, comparableIds, { filmConnections, corpusAggregates }) {
  const comps = comparableIds.map((id) => ({ id, conn: filmConnections(id) }));
  const n = comps.length;

  // Pool the comparable set's connected entities.
  const allFest = comps.flatMap((c) => c.conn.festivals);
  const allFunders = comps.flatMap((c) => c.conn.funders);
  const allPlatforms = comps.flatMap((c) => c.conn.availability);
  const allPract = comps.flatMap((c) => c.conn.practitioners);

  // ---- GENERAL: the landscape / typical path for this kind of film ----
  const withFestivals = comps.filter((c) => c.conn.festivals.length).length;
  const withAwards = comps.filter((c) => c.conn.awards.length).length;
  const withPlatform = comps.filter((c) => c.conn.availability.length).length;
  const aListPlays = comps.filter((c) => c.conn.festivals.some((f) => f.tier === "a_list")).length;
  const agg = corpusAggregates();

  const pct = (x) => (n ? Math.round((x / n) * 100) : 0);
  const general = {
    comparableCount: n,
    narrative: n
      ? `Across the ${n} films whose release trajectory most resembles “${targetRow.title}”, the typical path runs festival-first: ${pct(
          withFestivals
        )}% had a documented festival run${
          aListPlays ? ` and ${pct(aListPlays)}% premiered or played an A-list festival` : ""
        }. ${pct(withAwards)}% picked up at least one award, and ${pct(
          withPlatform
        )}% reached a documented digital/platform window. This is a festival-led, awards-amplified path to audience — not a wide theatrical one.`
      : "Not enough comparable trajectory data to characterise the landscape for this film yet.",
    signals: [
      { label: "Have a festival run", value: pct(withFestivals), suffix: "%" },
      { label: "Won an award", value: pct(withAwards), suffix: "%" },
      { label: "Reached a platform window", value: pct(withPlatform), suffix: "%" },
      { label: "Played an A-list festival", value: pct(aListPlays), suffix: "%" },
    ],
    corpusFormats: agg.formats,
  };

  // ---- QUANTITATIVE: ranges from the comparable set (only supported dims) ----
  const festCounts = comps.map((c) => c.conn.festivals.length).filter((x) => x > 0);
  const festSpans = comps
    .map((c) => {
      const ys = c.conn.festivals.map((f) => f.screening?.year).filter(Boolean);
      return ys.length ? Math.max(...ys) - Math.min(...ys) : null;
    })
    .filter((x) => x != null);
  const territoryCounts = comps
    .map((c) => new Set(c.conn.availability.map((a) => a.territory)).size)
    .filter((x) => x > 0);

  const quantitative = {
    comparableCount: n,
    metrics: [
      { key: "festival_run", label: "Festivals per film", unit: "festivals", range: range(festCounts), available: festCounts.length > 0 },
      { key: "festival_span", label: "Festival run length", unit: "years", range: range(festSpans), available: festSpans.length > 0 },
      { key: "territories", label: "Release territories (digital)", unit: "territories", range: range(territoryCounts), available: territoryCounts.length > 0 },
      { key: "runtime", label: "Runtime", unit: "mins", range: range(comps.map(() => null)), available: false },
    ],
    note:
      "Box office and P&A are not present in this corpus, so no economic ranges are shown. Quantitative answers are limited to the dimensions the data supports.",
  };

  // ---- WHO: entity frequency among the comparables ----
  const who = {
    comparableCount: n,
    festivals: tally(allFest, (f) => f.name).slice(0, 8),
    funders: tally(allFunders, (f) => f.name).slice(0, 8),
    platforms: tally(allPlatforms, (p) => p.name).slice(0, 8),
    practitioners: tally(
      allPract.filter((p) => /director|producer/i.test(p.role || "")),
      (p) => p.name
    ).slice(0, 8),
  };

  return { general, quantitative, who };
}
