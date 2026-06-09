const BASE = "/api";

export type FilmListItem = { id: string; title: string; year: number | null };
export type VenueSeries = {
  weeks: string[];
  venuesRaw: number[];
  sessionsRaw: number[];
  venues: number[];
  sessions: number[];
} | null;

async function get<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return (await res.json()).data as T;
}

export const api = {
  films: (q = "") => get<{ items: FilmListItem[] }>(`/films?limit=200&q=${encodeURIComponent(q)}`),
  venueSeries: (id: string) => get<{ film: FilmListItem; venue_series: VenueSeries }>(`/films/${id}/venue-series`),
};
