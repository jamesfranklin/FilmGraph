// Persisted cache of raw connector responses, keyed by TMDB id. Lets a reseed
// replay enrichment instead of re-fetching from 6–7 APIs, and is the unit a
// user privately shares to bootstrap a new install (TMDB data can't be publicly
// redistributed, but a private cache share is fine). Git-ignored.
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = process.env.FILMOS_CACHE_DIR || join(__dirname, "..", "..", "data", "cache");
const file = (id) => join(DIR, `${id}.json`);

export function readCache(id) {
  try {
    return JSON.parse(readFileSync(file(id), "utf8"));
  } catch {
    return {};
  }
}
export function writeCache(id, obj) {
  mkdirSync(DIR, { recursive: true });
  const tmp = `${file(id)}.tmp`;
  writeFileSync(tmp, JSON.stringify(obj));
  renameSync(tmp, file(id));
}
export function cacheCounts() {
  return {
    tmdb: Object.keys(readCache("tmdb")).length,
    assemble: Object.keys(readCache("assemble")).length,
    mrqe: Object.keys(readCache("mrqe")).length,
    boxoffice: Object.keys(readCache("boxoffice")).length,
  };
}
