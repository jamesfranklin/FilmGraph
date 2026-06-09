// The Composite Release Fingerprint.
//
// FilmGraph models a *release*. This module turns a film's connected entities
// into (a) a multi-dimensional trajectory "shape" over the phases of a release
// and (b) a comparable fingerprint. Per the sub-fingerprint comparison spec:
//
//  - Similarity is DISTANCE, not co-presence. Two films are similar on a
//    dimension because their patterns are close, not because both have data.
//  - Every sub-similarity is a continuous value in [0,1] (weighted Jaccard,
//    sequence similarity, vector/scalar closeness — never a presence flag).
//  - Absent ≠ zero. A dimension with no data is *absent*: it drops from the
//    weighted sum and the remaining weights renormalise. It is tracked and
//    rendered distinctly from a present-but-low dimension.
//  - Composite reports breadth (how many dimensions were actually compared) and
//    a confidence derived from it — a 1-dimension match is low-confidence.

/** The release timeline, left (origin) to right (afterlife). */
export const PHASES = [
  "Development",
  "Financing",
  "Premiere",
  "Festival run",
  "Awards",
  "Acquisition",
  "Theatrical",
  "Platform",
  "Long tail",
];

// The eight sub-fingerprint dimensions from the spec. `inCorpus` flags the ones
// the Doc Society corpus can populate; the rest are defined (so the model and
// the visualisation are honest about what's missing) but absent for every film.
// Default match weights. Re-tuned now that press / venue / box office carry real
// signal (they were placeholders when first set): the theatrical-trajectory
// dimensions (venue, box office) and press are weighted meaningfully rather than
// as rounding error. Weights only matter among dimensions both films share, and
// renormalise over them. `inCorpus` flags the dimensions real data can populate.
export const DIMENSIONS = [
  { key: "production", label: "Production", color: "#f0a35e", weight: 0.2, inCorpus: true },
  { key: "festival", label: "Festival", color: "#5b8def", weight: 0.22, inCorpus: true },
  { key: "window", label: "Window / platform", color: "#c98bdb", weight: 0.14, inCorpus: true },
  { key: "press", label: "Press", color: "#e57f8a", weight: 0.14, inCorpus: true },
  { key: "venue", label: "Venue", color: "#c0a3e0", weight: 0.12, inCorpus: true },
  { key: "boxoffice", label: "Box office", color: "#e6c84f", weight: 0.1, inCorpus: true },
  { key: "market", label: "Market", color: "#6fb1e6", weight: 0.04, inCorpus: false },
  { key: "practitioner", label: "Practitioners", color: "#5ec4a8", weight: 0.04, inCorpus: false },
];

export const DEFAULT_WEIGHTS = Object.fromEntries(DIMENSIONS.map((d) => [d.key, d.weight]));

const FESTIVAL_TIER_WEIGHT = { a_list: 1.0, major: 0.8, regional: 0.55, specialist: 0.4 };

// ---------- maths ----------
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const closeness = (a, b) => 1 - Math.abs(a - b); // two 0..1 scalars

// Amplitude scaling. Ideally a dimension's amplitude is measured *against the
// spine* — a film's percentile rank within the corpus distribution for that
// dimension (computed in profile.js and passed as `corpusStats`). Without stats
// (single-film/test path) we fall back to fixed divisors.
const FALLBACK_AMP = {
  production: (x) => clamp01(x / 3),
  festival: (x) => clamp01(x / 4),
  window: (x) => clamp01(x / 6),
  press: (x) => clamp01(x / 30),
  venue: (x) => clamp01(x / 25),
  boxoffice: (x) => clamp01(Math.log10(1 + x) / 8),
};
function amplitude(dim, raw, corpusStats) {
  const pct = corpusStats && corpusStats.pct && corpusStats.pct[dim];
  return pct ? pct(raw) : FALLBACK_AMP[dim](raw);
}

const AMP_DIMS = ["production", "festival", "window", "press", "venue", "boxoffice"];

/**
 * Build percentile lookups per dimension from a list of raw-magnitude objects
 * (one per film, with nulls for absent dimensions). A film's amplitude is then
 * its rank among the films that *have* that dimension — its standing on the spine.
 */
export function buildPercentiles(rawList) {
  const sorted = {};
  for (const d of AMP_DIMS) {
    sorted[d] = rawList
      .map((r) => (r ? r[d] : null))
      .filter((v) => v != null && Number.isFinite(v))
      .sort((a, b) => a - b);
  }
  const percentile = (arr, x) => {
    if (!arr.length) return 0;
    let lo = 0;
    let hi = arr.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (arr[m] <= x) lo = m + 1;
      else hi = m;
    }
    return lo / arr.length; // fraction of present films this value meets or beats
  };
  return { pct: Object.fromEntries(AMP_DIMS.map((d) => [d, (x) => percentile(sorted[d], x)])) };
}

/** Weighted Jaccard over two Maps of key→weight. Continuous in [0,1]. */
function weightedJaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  let uni = 0;
  const keys = new Set([...a.keys(), ...b.keys()]);
  for (const k of keys) {
    const x = a.get(k) || 0;
    const y = b.get(k) || 0;
    inter += Math.min(x, y);
    uni += Math.max(x, y);
  }
  return uni === 0 ? 0 : inter / uni;
}

/** Normalised Levenshtein similarity on two token sequences → [0,1]. */
function sequenceSim(a, b) {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const m = a.length;
  const n = b.length;
  const d = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  return 1 - d[m][n] / Math.max(m, n);
}

/** Plain Jaccard over two Sets. */
function setJaccard(a, b) {
  if (!a?.size && !b?.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

// Publication weight by type/prominence (tier-weighted press overlap).
function publicationWeight(type = "", topCritic = 0) {
  const t = String(type).toLowerCase();
  let w = 0.5;
  if (t.includes("trade")) w = 0.9;
  else if (t.includes("national")) w = 0.85;
  else if (t.includes("critic")) w = 0.7;
  else if (t.includes("regional")) w = 0.6;
  else if (t.includes("aggregator")) w = 0.5;
  return topCritic ? Math.min(1, w + 0.1) : w;
}

const roleWeight = (role = "") => {
  const r = role.toLowerCase();
  if (r.includes("director")) return 1.0;
  if (r.includes("writer")) return 0.7;
  if (r.includes("producer")) return 0.6;
  if (r.includes("editor") || r.includes("cinemat") || r.includes("compos") || r.includes("sound")) return 0.4;
  return 0.4;
};

// ---------- fingerprint ----------
/**
 * Build the fingerprint for a film `profile`. Each dimension carries its
 * representation and an explicit `present` flag (absent ≠ zero).
 */
export function computeFingerprint(profile, corpusStats = null) {
  const festivals = profile.festivals || [];
  const funders = profile.funders || [];
  const goodpitches = profile.goodpitches || [];
  const practitioners = profile.practitioners || [];
  const availability = profile.availability || [];
  const venues = profile.venues || [];
  const press = profile.press || [];
  const pressAggregate = profile.pressAggregate || {};

  // --- Production: role-weighted set of crew + funders-as-orgs ---
  const production = new Map();
  for (const p of practitioners) production.set(`p:${p.name.toLowerCase()}`, roleWeight(p.role));
  for (const f of funders) production.set(`o:${f.toLowerCase()}`, 0.5);
  if (goodpitches.length) production.set("o:good-pitch", 0.3);
  const productionRaw = [...production.values()].reduce((s, w) => s + w, 0);
  const productionIntensity = amplitude("production", productionRaw, corpusStats);

  // --- Festival: tier-weighted set + premiere/award boosts, plus a pathway ---
  const festSet = new Map();
  for (const f of festivals) {
    let w = FESTIVAL_TIER_WEIGHT[f.tier] || 0.4;
    if (f.award) w = Math.min(1, w * 1.2);
    if ((f.premiere || "").includes("world")) w = Math.min(1, w * 1.1);
    festSet.set(f.name.toLowerCase(), Math.max(festSet.get(f.name.toLowerCase()) || 0, w));
  }
  const festSeq = [...festivals]
    .filter((f) => f.year)
    .sort((a, b) => a.year - b.year)
    .map((f) => f.tier || "specialist");
  const festivalRaw = festivals.reduce((s, f) => s + (FESTIVAL_TIER_WEIGHT[f.tier] || 0.4), 0);
  const festivalIntensity = amplitude("festival", festivalRaw, corpusStats);

  // --- Window / platform: platform set + territory breadth ---
  const platformSet = new Map();
  const territories = new Set();
  for (const a of availability) {
    if (a.platform) platformSet.set(a.platform.toLowerCase(), 1);
    if (a.country) territories.add(a.country);
  }
  const territoryBreadth = clamp01(territories.size / 8);
  const windowIntensity = amplitude("window", territories.size, corpusStats);

  // --- Venue (Assemble): exhibition set weighted by sessions + geo + scale ---
  const venueSet = new Map();
  const venueGeo = new Set();
  let totalSessions = 0;
  for (const v of venues) {
    const sessions = v.sessions || 0;
    totalSessions += sessions;
    venueSet.set(v.name.toLowerCase(), Math.max(venueSet.get(v.name.toLowerCase()) || 0, 0.3 + clamp01(sessions / 30) * 0.7));
    if (v.country) venueGeo.add(v.country);
  }
  const venueScale = clamp01(Math.log10(1 + venues.length) / Math.log10(60)); // 0..1, scale-free-ish
  const venueIntensity = amplitude("venue", venues.length, corpusStats);

  // --- Press (MRQE): publication set (tier-weighted) + volume/sentiment vector ---
  const pressSet = new Map();
  for (const p of press) pressSet.set(p.publication.toLowerCase(), publicationWeight(p.tier, p.top_critic));
  const reviewVolume = pressAggregate.reviews ?? press.length;
  const pressAmp = amplitude("press", reviewVolume, corpusStats); // volume against the spine
  const pressVec = {
    volume: pressAmp,
    sentiment: pressAggregate.metric != null ? clamp01(pressAggregate.metric / 100) : 0.5,
  };
  const pressPresent = press.length > 0 || (pressAggregate.reviews ?? 0) > 0;
  const pressIntensity = pressAmp;

  // --- Box office (The Numbers): normalised weekly per-screen curve + magnitude ---
  const bo = profile.boxOffice;
  const boWeekly = (bo && bo.weekly) || [];
  const boSummary = (bo && bo.summary) || {};
  const boPresent = !!bo && (boWeekly.length > 0 || boSummary.domestic_total != null);
  // shape: per-theater weekly performance, normalised to its own peak (scale-free)
  const perTheater = boWeekly
    .map((w) => (w.per_theater != null ? w.per_theater : w.theaters ? w.gross / w.theaters : w.gross))
    .filter((v) => Number.isFinite(v) && v >= 0);
  const peak = Math.max(0, ...perTheater) || 1;
  const boCurve = perTheater.map((v) => v / peak);
  const total = boSummary.domestic_total || boSummary.worldwide_total || 0;
  const opening = boSummary.opening_weekend_gross || 0;
  const boMag = {
    openingMultiple: clamp01((opening ? total / opening : 0) / 6), // limited-release multiples run high
    legs: clamp01(boWeekly[1] && boWeekly[0]?.gross ? boWeekly[1].gross / boWeekly[0].gross : 0),
    runWeeks: clamp01((boSummary.run_weeks || boWeekly.length) / 12),
    widest: clamp01(Math.log10(1 + (boSummary.widest_theaters || 0)) / Math.log10(500)),
    scale: clamp01(Math.log10(1 + total) / 8),
  };
  const boIntensity = amplitude("boxoffice", total, corpusStats);

  const dims = {
    production: { present: production.size > 0, set: production, count: production.size, intensity: productionIntensity },
    festival: { present: festivals.length > 0, set: festSet, seq: festSeq, count: festivals.length, intensity: festivalIntensity },
    window: {
      present: availability.length > 0,
      set: platformSet,
      territoryBreadth,
      platformCount: platformSet.size,
      intensity: windowIntensity,
    },
    press: { present: pressPresent, set: pressSet, vec: pressVec, intensity: pressIntensity },
    venue: {
      present: venues.length > 0,
      set: venueSet,
      geo: venueGeo,
      scale: venueScale,
      intensity: venueIntensity,
    },
    boxoffice: { present: boPresent, curve: boCurve, mag: boMag, intensity: boIntensity },
    market: { present: false },
    practitioner: { present: false },
  };

  const presentCount = DIMENSIONS.filter((d) => dims[d.key]?.present).length;

  // Raw magnitudes per present dimension — used to build the corpus percentile
  // distribution (the "spine") in a first pass; null where the dimension is absent.
  const rawMag = {
    production: production.size > 0 ? productionRaw : null,
    festival: festivals.length > 0 ? festivalRaw : null,
    window: availability.length > 0 ? territories.size : null,
    press: pressPresent ? reviewVolume : null,
    venue: venues.length > 0 ? venues.length : null,
    boxoffice: boPresent ? total : null,
  };

  return {
    dims,
    presentCount,
    completeness: presentCount / DIMENSIONS.length,
    subjectSet: (profile.subjects || []).map((s) => s.toLowerCase()),
    countrySet: (profile.countries || []).map((c) => c.toLowerCase()),
    rawMag,
    trajectory: buildTrajectory(dims),
  };
}

// Maps each present dimension's intensity onto release phases (the streamgraph).
// `present` is carried through so the chart can distinguish absent from zero.
function buildTrajectory(dims) {
  const layers = DIMENSIONS.map((d) => {
    const dim = dims[d.key] || { present: false };
    const i = dim.intensity || 0;
    const v = new Array(PHASES.length).fill(0);
    switch (d.key) {
      case "production":
        v[0] = i; v[1] = i * 0.8; v[2] = i * 0.3;
        break;
      case "festival":
        v[2] = i; v[3] = i; v[4] = i * 0.5;
        break;
      case "window":
        v[5] = i * 0.6; v[6] = i; v[7] = i; v[8] = i * 0.7;
        break;
      case "press":
        v[2] = i * 0.5; v[3] = i; v[6] = i * 0.6;
        break;
      case "market":
        v[5] = i;
        break;
      case "practitioner":
        v[0] = i * 0.5; v[6] = i;
        break;
      case "venue":
        v[6] = i; v[7] = i * 0.6;
        break;
      case "boxoffice":
        v[6] = i; v[7] = i;
        break;
      default:
        break;
    }
    return { key: d.key, label: d.label, color: d.color, present: dim.present, values: v };
  });
  return { phases: PHASES, layers };
}

// ---------- similarity ----------
// `intensity` is each dimension's magnitude expressed as a percentile against
// the corpus (the spine) — see computeFingerprint/amplitude. Magnitude-closeness
// terms below compare those percentiles, so "similar scale" means "similar
// standing on the spine", not closeness on an arbitrary fixed divisor.
function dimSimilarity(key, a, b) {
  const magClose = closeness(a.intensity || 0, b.intensity || 0); // spine-relative magnitude
  switch (key) {
    case "production":
      return weightedJaccard(a.set, b.set);
    case "festival": {
      const setSim = weightedJaccard(a.set, b.set);
      // Pathway only counts when BOTH films have a year-ordered run; otherwise
      // there's no sequence to compare, so its weight folds into the set overlap
      // (two missing pathways must not read as a perfect pathway match).
      const haveSeq = (a.seq?.length || 0) > 0 && (b.seq?.length || 0) > 0;
      if (haveSeq) {
        const seq = sequenceSim(a.seq, b.seq);
        return 0.55 * setSim + 0.3 * seq + 0.15 * magClose;
      }
      return 0.8 * setSim + 0.2 * magClose;
    }
    case "window": {
      const plat = weightedJaccard(a.set, b.set);
      return 0.55 * plat + 0.45 * magClose; // platform overlap + release-breadth standing
    }
    case "press": {
      const setSim = weightedJaccard(a.set || new Map(), b.set || new Map());
      const va = a.vec || {};
      const vb = b.vec || {};
      const keys = ["volume", "sentiment"];
      const dist = Math.sqrt(keys.reduce((s, k) => s + ((va[k] || 0) - (vb[k] || 0)) ** 2, 0) / keys.length);
      const vecSim = 1 - dist;
      return 0.5 * setSim + 0.5 * vecSim;
    }
    case "venue": {
      // Exhibition footprint: which venues (session-weighted), geographic spread,
      // and overall scale relative to the corpus.
      const venueSim = weightedJaccard(a.set || new Map(), b.set || new Map());
      const geo = setJaccard(a.geo || new Set(), b.geo || new Set());
      return 0.55 * venueSim + 0.25 * geo + 0.2 * magClose;
    }
    case "boxoffice": {
      // Shape (decay/hold of the per-screen weekly run, scale-free) via DTW, plus
      // ratio features and corpus-relative scale. Falls back to magnitude only.
      const am = a.mag || {};
      const bm = b.mag || {};
      const ratioKeys = ["openingMultiple", "legs", "runWeeks", "widest"];
      const ratioSim = ratioKeys.reduce((s, k) => s + closeness(am[k] || 0, bm[k] || 0), 0) / ratioKeys.length;
      const magSim = 0.7 * ratioSim + 0.3 * magClose; // scale = total gross percentile
      if ((a.curve?.length || 0) >= 2 && (b.curve?.length || 0) >= 2) {
        return 0.6 * dtwSim(a.curve, b.curve) + 0.4 * magSim;
      }
      return magSim;
    }
    default:
      return 0;
  }
}

// Dynamic Time Warping similarity for two normalised [0,1] series (different
// lengths allowed). Shape of the curve matters more than absolute magnitude.
function dtwSim(a, b) {
  const n = a.length;
  const m = b.length;
  if (!n || !m) return 0;
  const d = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(Infinity));
  d[0][0] = 0;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = Math.abs(a[i - 1] - b[j - 1]);
      d[i][j] = cost + Math.min(d[i - 1][j], d[i][j - 1], d[i - 1][j - 1]);
    }
  }
  return clamp01(1 - d[n][m] / (n + m)); // path length ~ n+m; values in [0,1]
}

// Confidence label from how many dimensions were actually compared.
// Confidence is a function of ABSOLUTE breadth (out of all 8 dimensions), never
// relative to what this dataset happens to carry. It is capped at "medium" until
// breadth is genuinely high (>=5 of 8) — so the honest route to "high" is
// ingesting more dimensions (the gold set), not a label change. With only three
// dimensions populated in this corpus, the best attainable here is "medium".
function confidenceFor(breadth) {
  if (breadth >= 5) return "high";
  if (breadth >= 3) return "medium";
  if (breadth >= 1) return "low";
  return "none";
}
// Breadth penalty so a 1-dimension match can't masquerade as a strong one.
function breadthFactor(breadth) {
  if (breadth <= 0) return 0;
  return 0.4 + 0.6 * Math.min((breadth - 1) / 2, 1); // 1→0.40, 2→0.70, 3+→1.0
}

/**
 * Composite trajectory similarity. Only dimensions present in BOTH films
 * contribute; weights renormalise over them. Returns the raw score, the
 * breadth (shared dimensions), a confidence label, a breadth-adjusted score for
 * ranking, and the per-dimension breakdown.
 */
export function similarity(fpA, fpB, weights = DEFAULT_WEIGHTS) {
  const contributions = [];
  let weightedSum = 0;
  let weightUsed = 0;
  for (const d of DIMENSIONS) {
    const a = fpA.dims[d.key];
    const b = fpB.dims[d.key];
    if (!a?.present || !b?.present) continue;
    const sim = dimSimilarity(d.key, a, b);
    const w = weights[d.key] ?? 0;
    weightedSum += w * sim;
    weightUsed += w;
    contributions.push({ key: d.key, label: d.label, color: d.color, similarity: sim, weight: w });
  }
  const score = weightUsed === 0 ? 0 : weightedSum / weightUsed;
  const breadth = contributions.length;
  for (const c of contributions) {
    c.contribution = weightUsed === 0 ? 0 : (c.weight * c.similarity) / weightUsed;
  }
  contributions.sort((x, y) => y.weight * y.similarity - x.weight * x.similarity);
  return {
    score,
    sharedDimensions: breadth,
    confidence: confidenceFor(breadth),
    adjustedScore: score * breadthFactor(breadth),
    contributions,
  };
}

// Tolerant of both the current entry-pair format ([[key, weight], ...]) and the
// legacy Set→array format (["key", ...]) so an unmigrated local DB doesn't throw.
function toMap(set) {
  if (!Array.isArray(set)) return undefined;
  if (set.length === 0) return new Map();
  return Array.isArray(set[0]) ? new Map(set) : new Map(set.map((k) => [k, 1]));
}

/** Rehydrate a JSON-stored fingerprint (arrays) back into one with Maps. */
export function deserialiseFingerprint(stored) {
  const dims = {};
  for (const [k, d] of Object.entries(stored.dims || {})) {
    // `present` is current; fall back to the legacy `populated` flag.
    const present = d.present ?? d.populated ?? false;
    dims[k] = {
      ...d,
      present,
      set: d.set !== undefined ? toMap(d.set) : undefined,
      geo: Array.isArray(d.geo) ? new Set(d.geo) : undefined,
    };
  }
  return { ...stored, dims };
}

/** Convert Maps to arrays of [key,weight] pairs for JSON storage. */
export function serialiseFingerprint(fp) {
  const dims = {};
  for (const [k, d] of Object.entries(fp.dims)) {
    dims[k] = {
      ...d,
      set: d.set ? [...d.set.entries()] : undefined,
      geo: d.geo ? [...d.geo] : undefined,
    };
  }
  return { ...fp, dims, trajectory: undefined };
}

/** Subject/genre similarity — the comparison FilmOS argues *against*. */
export function genreSimilarity(fpA, fpB) {
  const jac = (a, b) => {
    const A = new Set(a);
    const B = new Set(b);
    if (!A.size && !B.size) return 0;
    let i = 0;
    for (const x of A) if (B.has(x)) i++;
    return i / (A.size + B.size - i);
  };
  return 0.75 * jac(fpA.subjectSet, fpB.subjectSet) + 0.25 * jac(fpA.countrySet, fpB.countrySet);
}
