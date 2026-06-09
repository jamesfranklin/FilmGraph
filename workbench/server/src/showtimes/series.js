import { venueId } from "../lib/venueId.js";
import { isoWeekKey, weekRange } from "../lib/isoweek.js";
import { peakNormalise } from "./normalise.js";

// One showtime record contributes `sessions` (default 1) at a date. Accepts
// either `datetime` (per-showtime) or `date` (aggregated) — both required to
// carry a real date; records without one are skipped (counted as `dropped`).
function recordDate(rec) {
  const raw = rec.datetime || rec.date;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
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
    const id = v.id || venueId(v.name, v.city, v.country);
    const sessions = rec.sessions != null ? Number(rec.sessions) : 1;

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
  const venuesRaw = weeks.map((w) => (weekVenues.get(w) ? weekVenues.get(w).size : 0));
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
