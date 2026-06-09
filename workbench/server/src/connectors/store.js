// Per-connector local config (API keys + last-run summary). Stored in a
// git-ignored JSON file so it survives reseeds (which drop the graph tables).
// In the real product this is per-FilmOS-account; for the demo it's one local
// account, so a single file is enough.
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Packaged builds set FILMOS_CONFIG_PATH to a writable app-data location, since
// the bundled server/data dir is read-only. Dev falls back to the repo path.
const FILE = process.env.FILMOS_CONFIG_PATH || join(__dirname, "..", "..", "data", "connectors.local.json");

function load() {
  if (!existsSync(FILE)) return {};
  try {
    return JSON.parse(readFileSync(FILE, "utf8"));
  } catch {
    return {};
  }
}
function save(all) {
  // Atomic write (temp + rename) so a crash/full disk can't corrupt the file,
  // and 0600 since it can hold an API key.
  mkdirSync(dirname(FILE), { recursive: true });
  const tmp = `${FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(all, null, 2), { mode: 0o600 });
  renameSync(tmp, FILE);
}

export function getConfig(id) {
  return load()[id] || { configured: false };
}
export function setKey(id, apiKey) {
  const all = load();
  all[id] = { ...(all[id] || {}), apiKey: apiKey || null, configured: !!apiKey };
  save(all);
}
export function setRun(id, summary) {
  const all = load();
  all[id] = { ...(all[id] || {}), lastRun: new Date().toISOString(), lastSummary: summary };
  save(all);
}
/** Public view (never leaks the key itself — just whether one is set). */
export function publicConfig(id) {
  const c = getConfig(id);
  return {
    configured: !!c.apiKey || c.configured || false,
    hasKey: !!c.apiKey,
    lastRun: c.lastRun || null,
    lastSummary: c.lastSummary || null,
  };
}
