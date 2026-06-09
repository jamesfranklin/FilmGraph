// Connector registry + run orchestration. Each connector is network-scoped and
// writes into the local graph; after a run we recompute fingerprints so the new
// dimensions actually move the matches.
import { openDb } from "../db.js";
import { recomputeFingerprints } from "../profile.js";
import { getConfig, setKey, setRun, publicConfig } from "./store.js";
import * as tmdb from "./tmdb.js";
import * as assemble from "./assemble.js";
import * as mrqe from "./mrqe.js";
import * as boxoffice from "./boxoffice.js";

export const CONNECTORS = [
  {
    id: "tmdb",
    name: "TMDB",
    publisher: "The Movie Database",
    description: "Resolve missing TMDB ids and enrich films with genres, keywords, runtime and ratings.",
    network: true,
    requiresKey: true,
    keyLabel: "TMDB API key (v3)",
    activates: ["Metadata", "genre contrast"],
    note: "Run first — Assemble and MRQE key off the TMDB id.",
    runner: tmdb,
  },
  {
    id: "assemble",
    name: "Assemble Showtimes",
    publisher: "Assemble",
    description: "Pull the theatrical exhibition footprint — which venues played each film and how many sessions.",
    network: true,
    requiresKey: false,
    activates: ["Venue"],
    runner: assemble,
  },
  {
    id: "mrqe",
    name: "MRQE Reviews",
    publisher: "Movie Review Query Engine",
    description: "Pull critic reviews per film — publications, volume and the aggregate score.",
    network: true,
    requiresKey: false,
    activates: ["Press"],
    runner: mrqe,
  },
  {
    id: "boxoffice",
    name: "Box Office",
    publisher: "The Numbers (via Assemble)",
    description: "Pull the weekly theatrical run — grosses, theaters and per-screen averages over time.",
    network: true,
    requiresKey: false,
    activates: ["Box office"],
    runner: boxoffice,
  },
];

const byId = Object.fromEntries(CONNECTORS.map((c) => [c.id, c]));
const status = {}; // id -> { state, processed, total, message, summary }

export function listConnectors() {
  return CONNECTORS.map((c) => ({
    id: c.id,
    name: c.name,
    publisher: c.publisher,
    description: c.description,
    network: c.network,
    requiresKey: c.requiresKey,
    keyLabel: c.keyLabel || null,
    activates: c.activates,
    note: c.note || null,
    status: status[c.id]?.state || "idle",
    config: publicConfig(c.id),
  }));
}

export function getStatus(id) {
  return status[id] || { state: "idle" };
}

export function configure(id, apiKey) {
  if (!byId[id]) throw new Error("unknown connector");
  setKey(id, apiKey);
  return publicConfig(id);
}

export function startRun(id, { limit } = {}) {
  const c = byId[id];
  if (!c) throw new Error("unknown connector");
  if (status[id]?.state === "running") return { started: false, reason: "already running" };
  const cfg = getConfig(id);
  if (c.requiresKey && !cfg.apiKey) {
    status[id] = { state: "error", message: "API key required" };
    return { started: false, reason: "key required" };
  }

  const n = Math.floor(Number(limit));
  const lim = Number.isFinite(n) && n > 0 ? n : null;
  const db = openDb();
  const films = db
    .prepare(`SELECT id, title, year, tmdb_id FROM films${lim ? ` LIMIT ${lim}` : ""}`)
    .all();
  status[id] = { state: "running", processed: 0, total: films.length, message: "starting" };

  (async () => {
    try {
      const summary = await c.runner.run({
        db,
        apiKey: cfg.apiKey,
        films,
        onProgress: (processed, total, message) => {
          status[id] = { state: "running", processed, total, message };
        },
      });
      recomputeFingerprints(db); // new edges -> refreshed fingerprints
      setRun(id, summary);
      status[id] = { state: "done", processed: films.length, total: films.length, summary };
    } catch (e) {
      status[id] = { state: "error", message: String(e.message || e) };
    } finally {
      try {
        db.close();
      } catch {
        /* already closed */
      }
    }
  })();

  return { started: true, total: films.length };
}
