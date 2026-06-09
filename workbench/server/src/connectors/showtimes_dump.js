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
  let filmsMatched = 0;
  let venues = 0;

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
        g.node(v.id, "Venue", v.name, { id: v.id, name: v.name, city: v.city, country: v.country, _source: "dump" });
        g.edge("EXHIBITED_AT", filmRow.id, v.id, { sessions: v.sessions, source: "dump" });
        venues++;
      }
      g.mergeFilmProps(filmRow.id, { venue_series: series });
    }
  });
  tx();
  return { filmsMatched, venues };
}
