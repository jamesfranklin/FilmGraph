// Replay cached connector responses onto the graph (no network). Run by the
// seed loader so a reseed restores TMDB/Assemble/MRQE enrichment from the local
// cache instead of re-fetching. Films are matched by TMDB id.
import { readCache } from "./cache.js";
import { applyTmdb } from "./tmdb.js";
import { applyAssemble } from "./assemble.js";
import { applyMrqe } from "./mrqe.js";
import { applyBoxOffice } from "./boxoffice.js";

export function replayFromCache(db) {
  const films = db.prepare("SELECT id, tmdb_id FROM films WHERE tmdb_id IS NOT NULL").all();
  const byTmdb = new Map(films.map((f) => [String(f.tmdb_id), f.id]));
  const counts = { tmdb: 0, assemble: 0, mrqe: 0, boxoffice: 0 };

  for (const [tid, movie] of Object.entries(readCache("tmdb"))) {
    const fid = byTmdb.get(tid);
    if (fid && movie) {
      applyTmdb(db, fid, movie);
      counts.tmdb++;
    }
  }
  for (const [tid, venues] of Object.entries(readCache("assemble"))) {
    const fid = byTmdb.get(tid);
    if (fid && venues) {
      applyAssemble(db, fid, venues);
      counts.assemble++;
    }
  }
  for (const [tid, mr] of Object.entries(readCache("mrqe"))) {
    const fid = byTmdb.get(tid);
    if (fid && mr) {
      applyMrqe(db, fid, mr.subject, mr.articles);
      counts.mrqe++;
    }
  }
  for (const [tid, bo] of Object.entries(readCache("boxoffice"))) {
    const fid = byTmdb.get(tid);
    if (fid && bo) {
      applyBoxOffice(db, fid, bo);
      counts.boxoffice++;
    }
  }
  return counts;
}
