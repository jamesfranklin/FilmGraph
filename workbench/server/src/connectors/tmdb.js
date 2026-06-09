// TMDB connector — enriches Film metadata and resolves missing tmdb_ids.
// v3 REST API; key supplied via the AppStore and passed as a query param.
import { getJson, makeGraph } from "./http.js";
import { readCache, writeCache } from "./cache.js";
import { recordEdit } from "../edits.js";

const BASE = "https://api.themoviedb.org/3";

/** Write one TMDB movie payload onto a film. Separated for offline testing. */
export function applyTmdb(db, filmId, movie) {
  const g = makeGraph(db);
  const genres = (movie.genres || []).map((x) => x.name);
  const keywords = ((movie.keywords && movie.keywords.keywords) || []).map((x) => x.name);
  g.mergeFilmProps(filmId, {
    tmdb_id: movie.id,
    imdb_id: movie.imdb_id || null,
    tmdb_genres: genres,
    keywords,
    vote_average: movie.vote_average ?? null,
    vote_count: movie.vote_count ?? null,
    overview: movie.overview || null,
    poster_path: movie.poster_path || null,
    ...(movie.runtime ? { runtime_mins: movie.runtime } : {}),
  });
  db.prepare(
    "UPDATE films SET tmdb_id = COALESCE(tmdb_id, ?), runtime = COALESCE(runtime, ?), year = COALESCE(year, ?) WHERE id = ?"
  ).run(movie.id, movie.runtime || null, Number((movie.release_date || "").slice(0, 4)) || null, filmId);
  return { genres: genres.length, keywords: keywords.length };
}

export async function run({ db, apiKey, films, onProgress, getJsonImpl = getJson }) {
  if (!apiKey) throw new Error("TMDB API key required");
  const cache = readCache("tmdb");
  let processed = 0;
  let resolved = 0;
  let enriched = 0;
  let failed = 0;
  for (const f of films) {
    processed++;
    try {
      let id = f.tmdb_id;
      if (!id) {
        const yr = f.year ? `&year=${f.year}` : "";
        const s = await getJsonImpl(`${BASE}/search/movie?query=${encodeURIComponent(f.title)}${yr}&api_key=${apiKey}`);
        const hit = (s.results || [])[0];
        if (hit) {
          id = hit.id;
          resolved++;
          recordEdit(f.id, { tmdb_id: id }); // a resolved id is a durable curation fact
        }
      }
      if (id) {
        const movie = await getJsonImpl(`${BASE}/movie/${id}?api_key=${apiKey}&append_to_response=keywords`);
        applyTmdb(db, f.id, movie);
        cache[String(id)] = movie; // keyed by TMDB id
        enriched++;
      }
    } catch {
      failed++;
    }
    onProgress?.(processed, films.length, f.title);
  }
  writeCache("tmdb", cache);
  return { processed, resolved, enriched, failed };
}
