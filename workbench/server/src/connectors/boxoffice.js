// Box Office connector — pulls The Numbers weekly run (via Assemble) for each
// film and stores it on the Film node, activating the Box office dimension.
// Keys off the film's TMDB id; run TMDB first.
import { getJson, makeGraph } from "./http.js";
import { readCache, writeCache } from "./cache.js";

const BASE = "https://api.assemble.film";

/** Store one box-office payload on a film. Separated for offline testing. */
export function applyBoxOffice(db, filmId, payload) {
  if (!payload) return { weeks: 0 };
  const g = makeGraph(db);
  g.mergeFilmProps(filmId, {
    box_office: {
      currency: payload.currency || "USD",
      territory: payload.territory || "domestic",
      release_date: payload.release_date || null,
      close_date: payload.close_date || null,
      production_budget: payload.production_budget ?? null,
      summary: payload.summary || null,
      weekly: payload.weekly || [],
      source: payload._source || null,
      fetched_at: payload._fetched_at || null,
    },
  });
  return { weeks: (payload.weekly || []).length };
}

export async function run({ db, films, onProgress, getJsonImpl = getJson }) {
  const cache = readCache("boxoffice");
  let processed = 0;
  let filmsWithBoxOffice = 0;
  let weeks = 0;
  let failed = 0;
  for (const f of films) {
    processed++;
    if (f.tmdb_id) {
      try {
        const p = await getJsonImpl(`${BASE}/api/movies/${f.tmdb_id}/box-office`);
        if (p && (p.summary || (p.weekly && p.weekly.length))) {
          const { weeks: w } = applyBoxOffice(db, f.id, p);
          cache[String(f.tmdb_id)] = p; // keyed by TMDB id
          filmsWithBoxOffice++;
          weeks += w;
        }
      } catch {
        failed++; // most films have no theatrical gross — expected
      }
    }
    onProgress?.(processed, films.length, f.title);
  }
  writeCache("boxoffice", cache);
  return { processed, filmsWithBoxOffice, weeks, failed };
}
