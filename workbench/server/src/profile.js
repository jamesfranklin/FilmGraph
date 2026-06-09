// Shared profile builder + fingerprint recompute.
//
// A film's fingerprint is derived entirely from its graph edges. The seed loader
// and the data connectors both write nodes/edges and then call recompute here,
// so an enriched graph (TMDB / Assemble venues / MRQE press) produces fingerprints
// the exact same way the seed does — no divergence between the two paths.
import { computeFingerprint, serialiseFingerprint, buildPercentiles } from "./fingerprint.js";

const jp = (s) => (s ? JSON.parse(s) : {});

/** Assemble a film's profile from its connected entities in the graph. */
export function buildProfile(db, filmId) {
  const filmRow = db.prepare("SELECT props FROM nodes WHERE id = ? AND type = 'Film'").get(filmId);
  const f = jp(filmRow?.props);

  const practitioners = db
    .prepare(
      `SELECT n.name AS name, e.props AS ep FROM edges e JOIN nodes n ON n.id = e.source_id
       WHERE e.target_id = ? AND e.type = 'WORKED_ON'`
    )
    .all(filmId)
    .map((r) => ({ name: r.name, role: jp(r.ep).role }));

  const funders = db
    .prepare(
      `SELECT n.name AS name FROM edges e JOIN nodes n ON n.id = e.source_id
       WHERE e.target_id = ? AND e.type = 'FUNDED'`
    )
    .all(filmId)
    .map((r) => r.name);

  const festivals = db
    .prepare(
      `SELECT n.name AS name, n.props AS np, e.props AS ep FROM edges e JOIN nodes n ON n.id = e.target_id
       WHERE e.source_id = ? AND e.type = 'SCREENED_AT'`
    )
    .all(filmId)
    .map((r) => {
      const np = jp(r.np);
      const ep = jp(r.ep);
      return { name: r.name, tier: np.tier, year: ep.year, award: ep.award_won, premiere: ep.premiere_status };
    });

  const availability = db
    .prepare(
      `SELECT n.name AS name, e.props AS ep FROM edges e JOIN nodes n ON n.id = e.target_id
       WHERE e.source_id = ? AND e.type = 'AVAILABLE_ON'`
    )
    .all(filmId)
    .map((r) => ({ platform: r.name, country: jp(r.ep).territory }));

  // Venue (Assemble): each EXHIBITED_AT carries a per-venue session count.
  const venues = db
    .prepare(
      `SELECT n.name AS name, n.props AS np, e.props AS ep FROM edges e JOIN nodes n ON n.id = e.target_id
       WHERE e.source_id = ? AND e.type = 'EXHIBITED_AT'`
    )
    .all(filmId)
    .map((r) => {
      const np = jp(r.np);
      const ep = jp(r.ep);
      return { name: r.name, city: np.city, country: np.country, sessions: ep.sessions || 0 };
    });

  // Press (MRQE): REVIEWED edges to Publication nodes + a film-level aggregate.
  const press = db
    .prepare(
      `SELECT n.name AS name, n.props AS np, e.props AS ep FROM edges e JOIN nodes n ON n.id = e.target_id
       WHERE e.source_id = ? AND e.type = 'REVIEWED'`
    )
    .all(filmId)
    .map((r) => {
      const np = jp(r.np);
      const ep = jp(r.ep);
      return { publication: r.name, tier: np.publication_type, top_critic: ep.top_critic };
    });

  return {
    id: filmId,
    title: f.title,
    year: f.year,
    format: f.format,
    countries: f.origin_country || [],
    subjects: f.subjects || [],
    festivals,
    funders,
    goodpitches: f.goodpitches || [],
    practitioners,
    availability,
    venues,
    press,
    pressAggregate: { metric: f.press_metric ?? null, reviews: f.press_reviews ?? null },
    boxOffice: f.box_office || null,
  };
}

/**
 * Recompute and persist fingerprints for the given film ids (or all films).
 *
 * Amplitudes are measured against the spine, so we always build the corpus
 * percentile distribution from *all* films first (pass 1), then compute the
 * requested fingerprints against it (pass 2) — even for a single-film recompute,
 * so its amplitudes stay consistent with the whole corpus.
 */
export function recomputeFingerprints(db, filmIds = null) {
  const allIds = db.prepare("SELECT id FROM films").all().map((r) => r.id);
  const ids = filmIds || allIds;

  // Pass 1: profiles + raw magnitudes across the whole corpus.
  const profiles = new Map();
  const rawList = [];
  for (const id of allIds) {
    const p = buildProfile(db, id);
    profiles.set(id, p);
    rawList.push(computeFingerprint(p).rawMag); // no stats → just need rawMag
  }
  const corpusStats = buildPercentiles(rawList);

  // Pass 2: compute + persist the requested films against the spine.
  const upd = db.prepare("UPDATE films SET completeness = ?, fingerprint = ?, trajectory = ? WHERE id = ?");
  const tx = db.transaction((list) => {
    for (const id of list) {
      const fp = computeFingerprint(profiles.get(id) || buildProfile(db, id), corpusStats);
      upd.run(fp.completeness, JSON.stringify(serialiseFingerprint(fp)), JSON.stringify(fp.trajectory), id);
    }
  });
  tx(ids);
  return ids.length;
}
