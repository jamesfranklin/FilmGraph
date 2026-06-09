import { makeGraph } from "./http.js";
import { filmVenueSeries } from "../showtimes/series.js";

/**
 * Ingest a parsed showtimes dump (keyed by tmdb_id) into the graph. Only films
 * already present in the corpus (matched by tmdb_id) are ingested. Idempotent:
 * EXHIBITED_AT edges are cleared per film before re-writing.
 */
export function ingestDump(db, dump) {
  const g = makeGraph(db);
  const filmByTmdb = db.prepare("SELECT id FROM films WHERE tmdb_id = ?");
  const getNodeProps = db.prepare("SELECT props FROM nodes WHERE id = ?");
  let filmsMatched = 0;
  let venues = 0;

  // Upsert a Venue node WITHOUT clobbering canonical metadata. A dump venue
  // reconciles to an already-seeded Venue by sharing its deterministic id, but
  // the dump only carries {id,name,city,country}. If we replaced, we would drop
  // the canonical address/website/lat-lng/is_independent the pipeline reconciles
  // against. So merge with existing props taking precedence; the dump only fills
  // keys an existing node lacks (and creates the node outright when it is new).
  const upsertVenue = (v) => {
    const dumpProps = { id: v.id, name: v.name, city: v.city, country: v.country, _source: "dump" };
    const existing = getNodeProps.get(v.id);
    const merged = existing ? { ...dumpProps, ...JSON.parse(existing.props) } : dumpProps;
    g.node(v.id, "Venue", merged.name ?? v.name, merged);
  };

  const tx = db.transaction(() => {
    for (const key of Object.keys(dump)) {
      const entry = dump[key];
      const tmdb = entry.tmdb_id ?? Number(key);
      const filmRow = filmByTmdb.get(tmdb);
      if (!filmRow) continue; // cohort widening (new films) is a separate connector
      filmsMatched++;

      const { venues: venueSet, series } = filmVenueSeries(entry.showtimes);
      g.clearEdges(filmRow.id, "EXHIBITED_AT");
      for (const v of venueSet) {
        upsertVenue(v);
        g.edge("EXHIBITED_AT", filmRow.id, v.id, { sessions: v.sessions, source: "dump" });
        venues++;
      }
      g.mergeFilmProps(filmRow.id, { venue_series: series });
    }
  });
  tx();
  return { filmsMatched, venues };
}
