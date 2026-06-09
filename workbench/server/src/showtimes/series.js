import { venueId } from "../lib/venueId.js";
import { isoWeekKey, weekRange } from "../lib/isoweek.js";
import { peakNormalise } from "./normalise.js";

// One showtime record contributes `sessions` (default 1) at a date. Accepts
// either `datetime` (per-showtime) or `date` (aggregated) — both required to
// carry a real date; records without one are skipped (counted as `dropped`).
function recordDate(rec) {
  const raw = rec.datetime || rec.date;
  if (!raw) return null;
  // Bin by calendar date only (timezone-independent): take the YYYY-MM-DD
  // prefix and construct a UTC date, so week boundaries never depend on the
  // host clock's timezone. A cinema showtime belongs to the week of its local
  // calendar date as written.
  const m = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * @param {Array} showtimes dump records for ONE film
 * @returns {{ venues: Array<{id,name,city,country,sessions}>, dropped: number,
 *            series: { weeks: string[], venuesRaw: number[], sessionsRaw: number[],
 *                      venues: number[], sessions: number[] } }}
 */
export function filmVenueSeries(showtimes) {
  const venueAgg = new Map(); // id → {id,name,city,country,sessions}
  const weekVenues = new Map(); // weekKey → Set(venueId)
  const weekSessions = new Map(); // weekKey → session count
  let dropped = 0;

  for (const rec of showtimes || []) {
    const date = recordDate(rec);
    if (!date) { dropped++; continue; }
    const v = rec.venue || {};
    if (!v.name) { dropped++; continue; }   // a record with no venue is unusable
    const id = v.id || venueId(v.name, v.city, v.country);
    const n = Number(rec.sessions);
    const sessions = Number.isFinite(n) && rec.sessions != null ? n : 1;

    const existing = venueAgg.get(id) || { id, name: v.name, city: v.city, country: v.country, sessions: 0 };
    existing.sessions += sessions;
    venueAgg.set(id, existing);

    const wk = isoWeekKey(date);
    if (!weekVenues.has(wk)) weekVenues.set(wk, new Set());
    weekVenues.get(wk).add(id);
    weekSessions.set(wk, (weekSessions.get(wk) || 0) + sessions);
  }

  const keys = [...weekVenues.keys()].sort();
  const weeks = keys.length ? weekRange(keys[0], keys[keys.length - 1]) : [];
  const venuesRaw = weeks.map((w) => { const s = weekVenues.get(w); return s ? s.size : 0; });
  const sessionsRaw = weeks.map((w) => weekSessions.get(w) || 0);

  return {
    venues: [...venueAgg.values()],
    dropped,
    series: {
      weeks,
      venuesRaw,
      sessionsRaw,
      venues: peakNormalise(venuesRaw),
      sessions: peakNormalise(sessionsRaw),
    },
  };
}
