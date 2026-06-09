// Assemble connector — pulls the exhibition footprint (venues + session counts)
// for each film and writes EXHIBITED_AT edges, activating the Venue dimension.
// Keys off the film's TMDB id, so run TMDB first.
import { getJson, makeGraph } from "./http.js";
import { readCache, writeCache } from "./cache.js";

const BASE = "https://api.assemble.film";

/** Write one playdates_schedule payload (the `data` array) onto a film. */
export function applyAssemble(db, filmId, venues) {
  const g = makeGraph(db);
  g.clearEdges(filmId, "EXHIBITED_AT"); // idempotent re-runs
  let count = 0;
  for (const v of venues || []) {
    const vid = `venue-${v.id}`;
    g.node(vid, "Venue", v.name, {
      id: vid,
      name: v.name,
      city: v.city,
      state: v.state || null,
      country: v.country_iso,
      website: v.website || null,
      _source: "assemble",
    });
    g.edge("EXHIBITED_AT", filmId, vid, {
      sessions: v.showtimes_amount || 0,
      notes: v.showtimes_notes || null,
      opened: v.timestamp || null,
    });
    count++;
  }
  return { venues: count };
}

export async function run({ db, films, onProgress, getJsonImpl = getJson }) {
  const cache = readCache("assemble");
  let processed = 0;
  let filmsWithVenues = 0;
  let venues = 0;
  let failed = 0;
  for (const f of films) {
    processed++;
    if (f.tmdb_id) {
      try {
        const r = await getJsonImpl(`${BASE}/api/venues/playdates_schedule?film_id=${f.tmdb_id}&time_mode=all`);
        const data = r && r.data ? r.data : [];
        const { venues: n } = applyAssemble(db, f.id, data);
        cache[String(f.tmdb_id)] = data; // keyed by TMDB id
        if (n) {
          filmsWithVenues++;
          venues += n;
        }
      } catch {
        failed++;
      }
    }
    onProgress?.(processed, films.length, f.title);
  }
  writeCache("assemble", cache);
  return { processed, filmsWithVenues, venues, failed };
}

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

function toIso(year, monthName, day) {
  const m = MONTHS[String(monthName).toLowerCase()];
  if (!m || !day) return null;
  return `${year}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Parse a public-endpoint timestamp string into a coarse interval.
 * @returns {{ start: string|null, end: string|null, fidelity: "range"|"day"|"open"|"none" }}
 */
export function parseTimestamp(raw, year) {
  const s = String(raw || "").trim();
  let m;
  // "May 8 - May 14"
  if ((m = s.match(/^([A-Za-z]+)\s+(\d{1,2})\s*[-–]\s*([A-Za-z]+)\s+(\d{1,2})$/))) {
    return { start: toIso(year, m[1], m[2]), end: toIso(year, m[3], m[4]), fidelity: "range" };
  }
  // "March 1 only"
  if ((m = s.match(/^([A-Za-z]+)\s+(\d{1,2})\s+only$/i))) {
    const d = toIso(year, m[1], m[2]);
    return { start: d, end: d, fidelity: "day" };
  }
  // "Opens June 19"
  if ((m = s.match(/^opens\s+([A-Za-z]+)\s+(\d{1,2})$/i))) {
    return { start: toIso(year, m[1], m[2]), end: null, fidelity: "open" };
  }
  return { start: null, end: null, fidelity: "none" };
}
