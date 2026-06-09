// MRQE connector — two hops: resolve a film's MRQE "subject" by TMDB id, then
// pull its reviews. Writes Publication nodes + REVIEWED edges and a film-level
// press aggregate, activating the Press dimension. Run TMDB first.
import { getJson, makeGraph } from "./http.js";
import { readCache, writeCache } from "./cache.js";
import { slugify } from "../parse.js";

const BASE = "https://api.mrqe.com";

// Crude publication tiering from the outlet name.
function pubType(source = "") {
  const s = source.toLowerCase();
  if (/variety|hollywood reporter|screen daily|deadline|indiewire|screen international/.test(s)) return "trade";
  if (/new york times|guardian|washington post|\btimes\b|telegraph|le monde|bbc|npr|rolling stone/.test(s))
    return "national";
  return "critic";
}

/** Write one subject + its articles onto a film. Separated for offline testing. */
export function applyMrqe(db, filmId, subject, articles) {
  const g = makeGraph(db);
  g.clearEdges(filmId, "REVIEWED"); // idempotent re-runs
  const pubs = new Set();
  let reviews = 0;
  for (const a of articles || []) {
    if (a.article_type && a.article_type !== "REVIEW") continue;
    const source = a.source || a.reviewer || "Unknown";
    const pid = `pub-${slugify(source)}`;
    g.node(pid, "Publication", source, { id: pid, name: source, publication_type: pubType(source) });
    g.edge("REVIEWED", filmId, pid, {
      reviewer: a.reviewer || null,
      url: a.url || null,
      top_critic: a.top_critic || 0,
      date: a.date_published || null,
    });
    pubs.add(pid);
    reviews++;
  }
  if (subject) {
    g.mergeFilmProps(filmId, {
      press_metric: subject.metric ?? null,
      press_reviews: subject.number_of_reviews ?? reviews,
      mrqe_subject_id: subject.id,
    });
  }
  return { publications: pubs.size, reviews };
}

export async function run({ db, films, onProgress, getJsonImpl = getJson }) {
  const cache = readCache("mrqe");
  let processed = 0;
  let filmsWithPress = 0;
  let reviews = 0;
  let failed = 0;
  for (const f of films) {
    processed++;
    if (f.tmdb_id) {
      try {
        const subs = await getJsonImpl(`${BASE}/api/subjects?external_id=${f.tmdb_id}&domain=tmdb`);
        const subject = (subs || [])[0];
        if (subject) {
          const articles = await getJsonImpl(`${BASE}/api/articles?subject_id=${subject.id}`);
          const { reviews: n } = applyMrqe(db, f.id, subject, articles);
          cache[String(f.tmdb_id)] = { subject, articles }; // keyed by TMDB id
          if (n) {
            filmsWithPress++;
            reviews += n;
          }
        }
      } catch {
        failed++;
      }
    }
    onProgress?.(processed, films.length, f.title);
  }
  writeCache("mrqe", cache);
  return { processed, filmsWithPress, reviews, failed };
}
