# Workbench Foundation + Venue Data Pipeline — Implementation Plan (Plan 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the workbench (stripped Vite + Node sidecar lifted from FilmOS-demo) and build the venue data pipeline that ingests a full showtimes dump into dump-derived weekly two-channel venue series, persisted and visible.

**Architecture:** A `workbench/` directory in this repo holds a Node/Express + better-sqlite3 sidecar (lifted from FilmOS-demo, desktop shell removed) and a minimal Vite/React UI. A new ingestion path reads a JSON showtimes dump keyed by TMDB id, groups dated showtimes into a per-film venue set + a weekly two-channel series (active venues, sessions), and persists them as `Venue` nodes, `EXHIBITED_AT` edges, and a `venue_series` blob on the `Film` node props. The sidecar emits data; the UI renders it.

**Tech Stack:** Node 18+ (ESM), Express, better-sqlite3, `node:test` (built-in test runner), `node:crypto` (uuid5), Vite, React, TypeScript.

**Source spec:** `docs/superpowers/specs/2026-06-09-matching-sandbox-design.md` (Phase 0 scaffold + Phase 1).

**Out of scope for Plan 1** (deferred to Plan 2 or pending external inputs): introspection panel, venue DTW, weighting (Phases 2–4); the `legacy_discovery.js` connector (legacy API details not yet available — see spec §12); the real production dump (we build and test against a committed fixture matching the spec §5 contract).

---

## File Structure

Created in this plan:

| Path | Responsibility |
|---|---|
| `workbench/server/src/lib/venueId.js` | Deterministic `uuid5(name+city+country)` venue IDs, matching `seed/venues/export.py` |
| `workbench/server/src/lib/isoweek.js` | Map a date to an ISO-week key; order week keys |
| `workbench/server/src/showtimes/series.js` | Pure: dump records for one film → venue set + weekly two-channel series |
| `workbench/server/src/showtimes/normalise.js` | Pure: peak-normalise a numeric channel to [0,1] |
| `workbench/server/src/connectors/showtimes_dump.js` | Ingest a parsed dump into the graph (Venue nodes, `EXHIBITED_AT`, `Film.venue_series`) |
| `workbench/server/src/connectors/assemble.js` | (lifted) + fallback `parseTimestamp` for low-fidelity public-endpoint series |
| `workbench/server/test/*.test.js` | `node:test` suites for each unit above |
| `workbench/server/test/fixtures/dump.sample.json` | Small showtimes dump fixture matching the spec §5 contract |
| `workbench/src/main.tsx`, `App.tsx`, `lib/api.ts` | Minimal UI: film list → venue-series view |

Lifted from `FilmOS-demo` (trimmed, not rewritten): `server/src/{db,seed,profile,fingerprint,parse,repo,edits,distribution,storage,questions}.js`, `server/src/connectors/{http,cache,tmdb,mrqe,boxoffice,replay,store,index}.js`, `server/data/seed/`, `index.html`, `vite.config.ts`.

Dropped (not copied): `src-tauri/`, `src/desktop/`, `src/apps/` (except logic we re-add minimally), `scripts/prepare-sidecar.mjs`, `TrajectoryChart`.

---

## Phase 0 — Scaffold the workbench

### Task 0.1: Create the workbench directory and lift the sidecar

**Files:**
- Create: `workbench/server/` (copied from `FilmOS-demo/server/src` + `data/seed`)
- Create: `workbench/server/package.json`
- Create: `workbench/.gitignore`

- [ ] **Step 1: Copy the sidecar source and seed data**

```bash
cd /Users/james/Sites/FilmGraph-workbench
mkdir -p workbench/server
cp -R /Users/james/Sites/FilmOS-demo/server/src workbench/server/src
mkdir -p workbench/server/data
cp -R /Users/james/Sites/FilmOS-demo/server/data/seed workbench/server/data/seed
cp /Users/james/Sites/FilmOS-demo/server/data/films_export_3.csv workbench/server/data/films_export_3.csv
```

- [ ] **Step 2: Write `workbench/server/package.json`** (adds `node:test` script; keeps lifted deps)

```json
{
  "name": "filmgraph-workbench-server",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "main": "src/index.js",
  "scripts": {
    "seed": "node src/seed.js",
    "dev": "node src/index.js",
    "start": "node src/index.js",
    "test": "node --test"
  },
  "dependencies": {
    "better-sqlite3": "^11.5.0",
    "csv-parse": "^5.5.6",
    "express": "^4.21.1"
  }
}
```

- [ ] **Step 3: Write `workbench/.gitignore`** (credentials + build artefacts never committed)

```gitignore
node_modules/
server/node_modules/
server/data/*.db
server/data/*.db-shm
server/data/*.db-wal
server/data/cache/
server/data/*.local.json
.env
dist/
```

- [ ] **Step 4: Install and seed to verify the lift works**

```bash
cd /Users/james/Sites/FilmGraph-workbench/workbench/server
npm install
npm run seed
```

Expected: `Wrote …` / `FilmOS local API …`-style seed output ending without error, and `server/data/filmos.db` exists.

- [ ] **Step 5: Commit**

```bash
cd /Users/james/Sites/FilmGraph-workbench
git add workbench/server/src workbench/server/package.json workbench/server/data/seed workbench/server/data/films_export_3.csv workbench/.gitignore
git commit -m "chore(workbench): lift FilmOS-demo sidecar into workbench/server"
```

### Task 0.2: Lift the minimal Vite frontend, strip the desktop shell

**Files:**
- Create: `workbench/package.json`, `workbench/index.html`, `workbench/vite.config.ts`, `workbench/tsconfig.json`
- Create: `workbench/src/main.tsx`, `workbench/src/App.tsx`, `workbench/src/styles.css`

- [ ] **Step 1: Write `workbench/package.json`**

```json
{
  "name": "filmgraph-workbench",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "concurrently -k -n server,web -c blue,green \"npm:dev:server\" \"npm:dev:web\"",
    "dev:web": "vite",
    "dev:server": "npm --prefix server run dev",
    "seed": "npm --prefix server run seed",
    "test:server": "npm --prefix server test",
    "build": "tsc -b && vite build"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.3",
    "concurrently": "^9.1.0",
    "typescript": "^5.6.3",
    "vite": "^5.4.11",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  }
}
```

- [ ] **Step 2: Write `workbench/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>FilmGraph Workbench</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Write `workbench/vite.config.ts`** (same localhost proxy pattern, port 1421 to avoid clashing with the demo)

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API_PORT = process.env.FILMOS_API_PORT || "4317";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1421,
    strictPort: true,
    proxy: { "/api": { target: `http://127.0.0.1:${API_PORT}`, changeOrigin: true } },
  },
  build: { outDir: "dist", target: "es2020", sourcemap: false },
});
```

- [ ] **Step 4: Write `workbench/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  },
  "include": ["src"]
}
```

- [ ] **Step 5: Write `workbench/src/main.tsx`**

```tsx
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 6: Write `workbench/src/styles.css`** (deliberately plain — tables and numbers)

```css
:root { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
body { margin: 0; background: #111; color: #ddd; }
.wrap { display: grid; grid-template-columns: 280px 1fr; height: 100vh; }
.col { overflow: auto; padding: 12px; border-right: 1px solid #333; }
table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; padding: 3px 8px; border-bottom: 1px solid #2a2a2a; }
.row:hover { background: #1c1c1c; cursor: pointer; }
.faint { color: #888; }
.bar { display: inline-block; height: 8px; background: #5b8def; vertical-align: middle; }
```

- [ ] **Step 7: Write a placeholder `workbench/src/App.tsx`** (replaced in Task 1.8; here just to boot)

```tsx
export function App() {
  return <div className="wrap"><div className="col">Workbench booting…</div><div className="col" /></div>;
}
```

- [ ] **Step 8: Verify the dev stack boots**

```bash
cd /Users/james/Sites/FilmGraph-workbench/workbench
npm install
npm run dev
```

Expected: both `server` (`…local API on http://127.0.0.1:4317`) and `web` (`Local: http://localhost:1421`) start. Open `http://localhost:1421` → "Workbench booting…". Ctrl-C to stop.

- [ ] **Step 9: Commit**

```bash
cd /Users/james/Sites/FilmGraph-workbench
git add workbench/package.json workbench/index.html workbench/vite.config.ts workbench/tsconfig.json workbench/src
git commit -m "chore(workbench): minimal Vite UI shell, desktop shell stripped"
```

---

## Phase 1 — Venue data pipeline

### Task 1.1: Deterministic venue ID (uuid5) utility

**Files:**
- Create: `workbench/server/src/lib/venueId.js`
- Test: `workbench/server/test/venueId.test.js`

- [ ] **Step 1: Write the failing test** — IDs must match `seed/venues/export.py`'s scheme (namespace `6f1d2c84-0d6c-5f8a-9b3e-2a7c4f9e1b00`, key `name|city|COUNTRY`, country upper-cased, fields trimmed).

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { venueId } from "../src/lib/venueId.js";

test("venueId is a deterministic RFC-4122 v5 UUID", () => {
  const a = venueId("Watershed", "Bristol", "gb");
  const b = venueId("  Watershed ", "Bristol", "GB"); // trimmed + upper country
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("different identity → different id", () => {
  assert.notEqual(venueId("Watershed", "Bristol", "GB"), venueId("Tyneside Cinema", "Newcastle", "GB"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd workbench/server && node --test test/venueId.test.js`
Expected: FAIL — cannot find module `../src/lib/venueId.js`.

- [ ] **Step 3: Write minimal implementation** (RFC 4122 v5, SHA-1, via `node:crypto`)

```js
import { createHash } from "node:crypto";

// Same namespace as seed/venues/export.py so IDs reconcile with venues.jsonl.
const NAMESPACE = "6f1d2c84-0d6c-5f8a-9b3e-2a7c4f9e1b00";

function uuidToBytes(uuid) {
  const hex = uuid.replace(/-/g, "");
  const out = Buffer.alloc(16);
  for (let i = 0; i < 16; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

function uuid5(name, namespace) {
  const hash = createHash("sha1");
  hash.update(uuidToBytes(namespace));
  hash.update(Buffer.from(name, "utf8"));
  const bytes = hash.digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = bytes.toString("hex");
  return `${hex.substr(0, 8)}-${hex.substr(8, 4)}-${hex.substr(12, 4)}-${hex.substr(16, 4)}-${hex.substr(20, 12)}`;
}

/** Deterministic venue id from identity (name|city|COUNTRY), trimmed. */
export function venueId(name, city, country) {
  const key = `${String(name).trim()}|${String(city).trim()}|${String(country).trim().toUpperCase()}`;
  return uuid5(key, NAMESPACE);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd workbench/server && node --test test/venueId.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Cross-check against the Python scheme** (one-off verification; not committed)

```bash
python3 -c "import uuid; ns=uuid.UUID('6f1d2c84-0d6c-5f8a-9b3e-2a7c4f9e1b00'); print(uuid.uuid5(ns,'Watershed|Bristol|GB'))"
cd workbench/server && node -e "import('./src/lib/venueId.js').then(m=>console.log(m.venueId('Watershed','Bristol','GB')))"
```

Expected: the two printed UUIDs are identical. (If not, the Node byte handling is wrong — fix before continuing.)

- [ ] **Step 6: Commit**

```bash
cd /Users/james/Sites/FilmGraph-workbench
git add workbench/server/src/lib/venueId.js workbench/server/test/venueId.test.js
git commit -m "feat(workbench): deterministic uuid5 venue ids matching export.py"
```

### Task 1.2: ISO-week key utility

**Files:**
- Create: `workbench/server/src/lib/isoweek.js`
- Test: `workbench/server/test/isoweek.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { isoWeekKey, weekRange } from "../src/lib/isoweek.js";

test("isoWeekKey returns YYYY-Www", () => {
  assert.equal(isoWeekKey(new Date("2025-05-08T19:30:00Z")), "2025-W19");
  assert.equal(isoWeekKey(new Date("2025-05-12T10:00:00Z")), "2025-W20"); // Monday rolls the week
});

test("weekRange enumerates inclusive consecutive week keys", () => {
  assert.deepEqual(weekRange("2025-W19", "2025-W21"), ["2025-W19", "2025-W20", "2025-W21"]);
});

test("weekRange spans a year boundary", () => {
  assert.deepEqual(weekRange("2024-W52", "2025-W01").length, weekRange("2024-W52", "2025-W01").length);
  assert.equal(weekRange("2024-W52", "2025-W01")[0], "2024-W52");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd workbench/server && node --test test/isoweek.test.js`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```js
// ISO-8601 week date helpers. Weeks start Monday; week 1 contains the year's
// first Thursday.
function isoWeekParts(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7; // Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - day); // shift to Thursday of this week
  const year = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return { year, week };
}

export function isoWeekKey(date) {
  const { year, week } = isoWeekParts(date);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

// Monday (UTC) of a given ISO week key — used to order and enumerate weeks.
function mondayOf(key) {
  const [y, w] = key.split("-W").map(Number);
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
  const monday = new Date(week1Monday);
  monday.setUTCDate(week1Monday.getUTCDate() + (w - 1) * 7);
  return monday;
}

export function weekRange(startKey, endKey) {
  const out = [];
  let cur = mondayOf(startKey);
  const end = mondayOf(endKey);
  while (cur <= end) {
    out.push(isoWeekKey(cur));
    cur = new Date(cur);
    cur.setUTCDate(cur.getUTCDate() + 7);
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd workbench/server && node --test test/isoweek.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/james/Sites/FilmGraph-workbench
git add workbench/server/src/lib/isoweek.js workbench/server/test/isoweek.test.js
git commit -m "feat(workbench): ISO-week key + range helpers"
```

### Task 1.3: Peak-normalisation utility

**Files:**
- Create: `workbench/server/src/showtimes/normalise.js`
- Test: `workbench/server/test/normalise.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { peakNormalise } from "../src/showtimes/normalise.js";

test("scales to the series' own peak", () => {
  assert.deepEqual(peakNormalise([0, 10, 5]), [0, 1, 0.5]);
});

test("a flat zero series stays zero (no divide-by-zero)", () => {
  assert.deepEqual(peakNormalise([0, 0, 0]), [0, 0, 0]);
});

test("scale-invariance: same shape at different magnitudes normalises equal", () => {
  assert.deepEqual(peakNormalise([4, 40, 20]), peakNormalise([1, 10, 5]));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd workbench/server && node --test test/normalise.test.js`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```js
/** Scale a numeric channel to [0,1] against its own peak. Empty/zero → zeros. */
export function peakNormalise(values) {
  const peak = Math.max(0, ...values);
  if (peak === 0) return values.map(() => 0);
  return values.map((v) => v / peak);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd workbench/server && node --test test/normalise.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/james/Sites/FilmGraph-workbench
git add workbench/server/src/showtimes/normalise.js workbench/server/test/normalise.test.js
git commit -m "feat(workbench): peak-normalisation for venue series channels"
```

### Task 1.4: The dump fixture (spec §5 contract)

**Files:**
- Create: `workbench/server/test/fixtures/dump.sample.json`

- [ ] **Step 1: Write the fixture** — two films, per-showtime granularity, dated, spanning multiple ISO weeks and a scale difference (film A: 2 venues; film B: 1 venue, same shape, smaller).

```json
{
  "111": {
    "tmdb_id": 111,
    "title": "Film A",
    "showtimes": [
      { "venue": { "name": "Watershed", "city": "Bristol", "country": "GB" }, "datetime": "2025-05-08T19:30:00" },
      { "venue": { "name": "Watershed", "city": "Bristol", "country": "GB" }, "datetime": "2025-05-09T18:00:00" },
      { "venue": { "name": "Tyneside Cinema", "city": "Newcastle upon Tyne", "country": "GB" }, "datetime": "2025-05-15T20:00:00" },
      { "venue": { "name": "Watershed", "city": "Bristol", "country": "GB" }, "datetime": "2025-05-16T20:00:00" }
    ]
  },
  "222": {
    "tmdb_id": 222,
    "title": "Film B",
    "showtimes": [
      { "venue": { "name": "Watershed", "city": "Bristol", "country": "GB" }, "date": "2025-05-08", "sessions": 1 },
      { "venue": { "name": "Watershed", "city": "Bristol", "country": "GB" }, "date": "2025-05-15", "sessions": 1 }
    ]
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/james/Sites/FilmGraph-workbench
git add workbench/server/test/fixtures/dump.sample.json
git commit -m "test(workbench): showtimes dump fixture matching spec contract"
```

### Task 1.5: Build the per-film venue set + weekly two-channel series

**Files:**
- Create: `workbench/server/src/showtimes/series.js`
- Test: `workbench/server/test/series.test.js`

- [ ] **Step 1: Write the failing test** — handles both the per-showtime variant (Film A) and the aggregated `{date, sessions}` variant (Film B); produces a venue set and a normalised two-channel weekly series over the full week span.

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { filmVenueSeries } from "../src/showtimes/series.js";
import { venueId } from "../src/lib/venueId.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dump = JSON.parse(readFileSync(join(__dirname, "fixtures", "dump.sample.json"), "utf8"));

test("venue set aggregates sessions per venue with deterministic ids", () => {
  const a = filmVenueSeries(dump["111"].showtimes);
  const watershed = a.venues.find((v) => v.name === "Watershed");
  assert.equal(watershed.id, venueId("Watershed", "Bristol", "GB"));
  assert.equal(watershed.sessions, 3); // 3 Watershed showtimes
  assert.equal(a.venues.length, 2);
});

test("weekly series spans W19..W20 with venue + session channels", () => {
  const a = filmVenueSeries(dump["111"].showtimes);
  assert.deepEqual(a.series.weeks, ["2025-W19", "2025-W20"]);
  // W19: Watershed active (2 showtimes). W20: Watershed + Tyneside active (2 showtimes).
  assert.deepEqual(a.series.venuesRaw, [1, 2]);
  assert.deepEqual(a.series.sessionsRaw, [2, 2]);
  assert.deepEqual(a.series.venues, [0.5, 1]); // peak-normalised
});

test("aggregated {date, sessions} records are honoured", () => {
  const b = filmVenueSeries(dump["222"].showtimes);
  assert.deepEqual(b.series.weeks, ["2025-W19", "2025-W20"]);
  assert.deepEqual(b.series.sessionsRaw, [1, 1]);
  assert.equal(b.venues.length, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd workbench/server && node --test test/series.test.js`
Expected: FAIL — cannot find module `../src/showtimes/series.js`.

- [ ] **Step 3: Write minimal implementation**

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd workbench/server && node --test test/series.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/james/Sites/FilmGraph-workbench
git add workbench/server/src/showtimes/series.js workbench/server/test/series.test.js
git commit -m "feat(workbench): per-film venue set + weekly two-channel series"
```

### Task 1.6: Ingest a parsed dump into the graph

**Files:**
- Create: `workbench/server/src/connectors/showtimes_dump.js`
- Test: `workbench/server/test/showtimes_dump.test.js`

Reuses the lifted `makeGraph` helper (`connectors/http.js`) and the `nodes`/`edges`/`films` schema. Stores the film-level series on the `Film` node props as `venue_series` (no schema change). `EXHIBITED_AT` edges carry `{ sessions, source: "dump" }`.

- [ ] **Step 1: Write the failing test** (in-memory DB built from the lifted schema)

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createSchema } from "../src/db.js";
import { ingestDump } from "../src/connectors/showtimes_dump.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dump = JSON.parse(readFileSync(join(__dirname, "fixtures", "dump.sample.json"), "utf8"));

function seedFilm(db, id, tmdb, title) {
  db.prepare("INSERT INTO films (id, tmdb_id, title) VALUES (?, ?, ?)").run(id, tmdb, title);
  db.prepare("INSERT INTO nodes (id, type, name, props) VALUES (?, 'Film', ?, ?)")
    .run(id, title, JSON.stringify({ title }));
}

test("ingestDump writes venues, EXHIBITED_AT edges, and Film.venue_series", () => {
  const db = new Database(":memory:");
  createSchema(db);
  seedFilm(db, "film-111", 111, "Film A");

  const result = ingestDump(db, dump);
  assert.equal(result.filmsMatched, 1); // only tmdb 111 is in the corpus
  assert.equal(result.venues, 2);

  const edges = db.prepare("SELECT * FROM edges WHERE source_id = 'film-111' AND type = 'EXHIBITED_AT'").all();
  assert.equal(edges.length, 2);
  assert.equal(JSON.parse(edges[0].props).source, "dump");

  const props = JSON.parse(db.prepare("SELECT props FROM nodes WHERE id = 'film-111'").get().props);
  assert.deepEqual(props.venue_series.weeks, ["2025-W19", "2025-W20"]);
  assert.deepEqual(props.venue_series.venues, [0.5, 1]);
});

test("ingestDump is idempotent — re-running does not duplicate edges", () => {
  const db = new Database(":memory:");
  createSchema(db);
  seedFilm(db, "film-111", 111, "Film A");
  ingestDump(db, dump);
  ingestDump(db, dump);
  const edges = db.prepare("SELECT COUNT(*) c FROM edges WHERE source_id = 'film-111' AND type = 'EXHIBITED_AT'").get();
  assert.equal(edges.c, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd workbench/server && node --test test/showtimes_dump.test.js`
Expected: FAIL — cannot find module `../src/connectors/showtimes_dump.js`.

- [ ] **Step 3: Write minimal implementation**

```js
import { makeGraph } from "./http.js";
import { filmVenueSeries } from "../showtimes/series.js";

/**
 * Ingest a parsed showtimes dump (keyed by tmdb_id) into the graph. Only films
 * already present in the corpus (matched by tmdb_id) are ingested. Idempotent:
 * EXHIBITED_AT edges are cleared per film before re-writing.
 */
export function ingestDump(db, dump) {
  const g = makeGraph(db);
  const filmByTmdb = db.prepare("SELECT id FROM films WHERE tmdb_id = ?");
  let filmsMatched = 0;
  let venues = 0;

  const tx = db.transaction(() => {
    for (const key of Object.keys(dump)) {
      const entry = dump[key];
      const tmdb = entry.tmdb_id ?? Number(key);
      const filmRow = filmByTmdb.get(tmdb);
      if (!filmRow) continue; // cohort widening (new films) is a separate connector
      filmsMatched++;

      const { venues: venueSet, series } = filmVenueSeries(entry.showtimes);
      g.clearEdges(filmRow.id, "EXHIBITED_AT");
      for (const v of venueSet) {
        g.node(v.id, "Venue", v.name, { id: v.id, name: v.name, city: v.city, country: v.country, _source: "dump" });
        g.edge("EXHIBITED_AT", filmRow.id, v.id, { sessions: v.sessions, source: "dump" });
        venues++;
      }
      g.mergeFilmProps(filmRow.id, { venue_series: series });
    }
  });
  tx();
  return { filmsMatched, venues };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd workbench/server && node --test test/showtimes_dump.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/james/Sites/FilmGraph-workbench
git add workbench/server/src/connectors/showtimes_dump.js workbench/server/test/showtimes_dump.test.js
git commit -m "feat(workbench): ingest showtimes dump → venues, EXHIBITED_AT, venue_series"
```

### Task 1.7: Surface `venue_series` through the profile builder

**Files:**
- Modify: `workbench/server/src/profile.js` (the `buildProfile` return object)
- Test: `workbench/server/test/profile_venue_series.test.js`

The lifted `buildProfile` already reads `EXHIBITED_AT` venues. Add the film-level `venueSeries` from the Film node props so Phase 3 (DTW) can consume it. This is an additive change — existing fields are untouched.

- [ ] **Step 1: Write the failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createSchema } from "../src/db.js";
import { ingestDump } from "../src/connectors/showtimes_dump.js";
import { buildProfile } from "../src/profile.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dump = JSON.parse(readFileSync(join(__dirname, "fixtures", "dump.sample.json"), "utf8"));

test("buildProfile surfaces venueSeries from Film props", () => {
  const db = new Database(":memory:");
  createSchema(db);
  db.prepare("INSERT INTO films (id, tmdb_id, title) VALUES ('film-111', 111, 'Film A')").run();
  db.prepare("INSERT INTO nodes (id, type, name, props) VALUES ('film-111','Film','Film A',?)")
    .run(JSON.stringify({ title: "Film A" }));
  ingestDump(db, dump);

  const profile = buildProfile(db, "film-111");
  assert.deepEqual(profile.venueSeries.weeks, ["2025-W19", "2025-W20"]);
  assert.equal(profile.venues.length, 2); // existing EXHIBITED_AT read still works
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd workbench/server && node --test test/profile_venue_series.test.js`
Expected: FAIL — `profile.venueSeries` is `undefined`.

- [ ] **Step 3: Make the minimal change to `buildProfile`** — in `workbench/server/src/profile.js`, the function loads `filmRow`/`f` at the top (`const f = jp(filmRow?.props);`). Add `venueSeries` to the returned object, immediately after the existing `venues,` line:

```js
    venues,
    venueSeries: f.venue_series || null,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd workbench/server && node --test test/profile_venue_series.test.js`
Expected: PASS (1 test).

- [ ] **Step 5: Run the whole suite to confirm no regression**

Run: `cd workbench/server && npm test`
Expected: all suites PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/james/Sites/FilmGraph-workbench
git add workbench/server/src/profile.js workbench/server/test/profile_venue_series.test.js
git commit -m "feat(workbench): expose venue_series on the film profile"
```

### Task 1.8: Low-fidelity fallback — parse `playdates_schedule` timestamps

**Files:**
- Modify: `workbench/server/src/connectors/assemble.js` (add `parseTimestamp`, exported)
- Test: `workbench/server/test/parseTimestamp.test.js`

Per spec §5 item 3, the public-endpoint strings are a flagged low-fidelity fallback. This task only builds + tests the parser (wiring it into a fallback ingest path is deferred until a film actually needs it). Year is supplied by the caller (the strings carry no year).

- [ ] **Step 1: Write the failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTimestamp } from "../src/connectors/assemble.js";

test("date range → start/end, high-ish fidelity", () => {
  const r = parseTimestamp("May 8 - May 14", 2025);
  assert.equal(r.start, "2025-05-08");
  assert.equal(r.end, "2025-05-14");
  assert.equal(r.fidelity, "range");
});

test("'March 1 only' → single day", () => {
  const r = parseTimestamp("March 1 only", 2025);
  assert.equal(r.start, "2025-03-01");
  assert.equal(r.end, "2025-03-01");
  assert.equal(r.fidelity, "day");
});

test("'Opens June 19' → open-ended from a date", () => {
  const r = parseTimestamp("Opens June 19", 2025);
  assert.equal(r.start, "2025-06-19");
  assert.equal(r.end, null);
  assert.equal(r.fidelity, "open");
});

test("'Now Playing' → no dates, lowest fidelity", () => {
  const r = parseTimestamp("Now Playing", 2025);
  assert.equal(r.start, null);
  assert.equal(r.fidelity, "none");
});

test("unparseable → null with 'none' fidelity", () => {
  const r = parseTimestamp("???", 2025);
  assert.equal(r.start, null);
  assert.equal(r.fidelity, "none");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd workbench/server && node --test test/parseTimestamp.test.js`
Expected: FAIL — `parseTimestamp` is not exported.

- [ ] **Step 3: Add the implementation to `workbench/server/src/connectors/assemble.js`** (append; do not alter the lifted functions)

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd workbench/server && node --test test/parseTimestamp.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/james/Sites/FilmGraph-workbench
git add workbench/server/src/connectors/assemble.js workbench/server/test/parseTimestamp.test.js
git commit -m "feat(workbench): low-fidelity playdates_schedule timestamp parser (fallback)"
```

### Task 1.9: CLI to ingest a dump file + minimal UI to view venue series

**Files:**
- Create: `workbench/server/src/showtimes/ingest-cli.js`
- Modify: `workbench/server/src/index.js` (add `GET /api/films/:id/venue-series`)
- Create: `workbench/src/lib/api.ts`
- Modify: `workbench/src/App.tsx`

- [ ] **Step 1: Write the ingest CLI** (`workbench/server/src/showtimes/ingest-cli.js`) — loads a dump JSON file into the seeded DB

```js
import { readFileSync } from "node:fs";
import { openDb } from "../db.js";
import { ingestDump } from "../connectors/showtimes_dump.js";
import { recomputeFingerprints } from "../profile.js";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node src/showtimes/ingest-cli.js <dump.json>");
  process.exit(2);
}
const dump = JSON.parse(readFileSync(file, "utf8"));
const db = openDb();
const result = ingestDump(db, dump);
recomputeFingerprints(db);
console.log(`Ingested: ${result.filmsMatched} films matched, ${result.venues} venue edges.`);
```

- [ ] **Step 2: Add the API endpoint** — in `workbench/server/src/index.js`, after the existing `/api/films/:id/trajectory` route, add:

```js
app.get("/api/films/:id/venue-series", (req, res) => {
  const row = getFilmRow(req.params.id);
  if (!row) return notFound(res, "Film");
  const node = getNode(req.params.id);
  const series = node && node.props && node.props.venue_series ? node.props.venue_series : null;
  ok(res, { film: { id: row.id, title: row.title, year: row.year }, venue_series: series });
});
```

(If `getNode` returns props as a JSON string rather than an object, parse it: `const props = typeof node.props === "string" ? JSON.parse(node.props) : node.props;` — verify against `repo.js getNode` when wiring this.)

- [ ] **Step 3: Write the frontend API client** (`workbench/src/lib/api.ts`)

```ts
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
```

- [ ] **Step 4: Replace `workbench/src/App.tsx`** with the film-list → venue-series view

```tsx
import { useEffect, useState } from "react";
import { api, type FilmListItem, type VenueSeries } from "./lib/api";

export function App() {
  const [films, setFilms] = useState<FilmListItem[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [series, setSeries] = useState<VenueSeries>(null);

  useEffect(() => { api.films().then((r) => setFilms(r.items)).catch(console.error); }, []);
  useEffect(() => {
    if (!sel) return;
    api.venueSeries(sel).then((r) => setSeries(r.venue_series)).catch(console.error);
  }, [sel]);

  return (
    <div className="wrap">
      <div className="col">
        <table>
          <tbody>
            {films.map((f) => (
              <tr className="row" key={f.id} onClick={() => setSel(f.id)}>
                <td>{f.title}</td><td className="faint">{f.year ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="col">
        {!series && <div className="faint">Select a film with venue data.</div>}
        {series && (
          <table>
            <thead><tr><th>Week</th><th>Venues</th><th>Sessions</th><th>Shape</th></tr></thead>
            <tbody>
              {series.weeks.map((w, i) => (
                <tr key={w}>
                  <td>{w}</td><td>{series.venuesRaw[i]}</td><td>{series.sessionsRaw[i]}</td>
                  <td><span className="bar" style={{ width: `${series.venues[i] * 120}px` }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Manual smoke test** — seed, ingest the fixture, run, and view

```bash
cd /Users/james/Sites/FilmGraph-workbench/workbench
npm run seed
# the fixture's tmdb ids (111/222) won't match the corpus; use a real dump or a
# corpus-matched fixture here. For the smoke test, ingest the fixture anyway:
node server/src/showtimes/ingest-cli.js server/test/fixtures/dump.sample.json
npm run dev
```

Expected: `Ingested: 0 films matched, 0 venue edges.` for the toy fixture (ids 111/222 are not in the Doc Society corpus — this is expected and confirms the matched-by-tmdb guard). The UI loads the film list at `http://localhost:1421`; selecting a film with no series shows the empty-state. (Real venue series appear once a corpus-matched dump is ingested — see "Validating with real data" below.)

- [ ] **Step 6: Commit**

```bash
cd /Users/james/Sites/FilmGraph-workbench
git add workbench/server/src/showtimes/ingest-cli.js workbench/server/src/index.js workbench/src/lib/api.ts workbench/src/App.tsx
git commit -m "feat(workbench): dump ingest CLI + venue-series API and viewer"
```

---

## Validating with real data (when the dump arrives)

Plan 1 is built and tested against the fixture. To validate end-to-end once the real dump lands:

1. Place the dump at `workbench/server/data/dump.json` (gitignored).
2. Confirm its films exist in the corpus (matched by `tmdb_id`); if not, the `legacy_discovery` connector (Plan 2 / pending API details) must add them first.
3. `node server/src/showtimes/ingest-cli.js server/data/dump.json` → expect non-zero films matched.
4. In the UI, open a venue-dense film and confirm the weekly series shows a real expansion/contraction shape (rising then falling venue counts), not a flat line.

This is the Phase 1 "done when": dump-derived weekly series exist across the Assemble films, and the distribution is real.

---

## Self-Review

**Spec coverage (Phase 0 + Phase 1):**
- Workbench is Vite + Node sidecar, desktop shell dropped → Tasks 0.1–0.2. ✓
- Full showtimes dump is the primary trajectory source; ingested to venue set + weekly two-channel series → Tasks 1.4–1.6. ✓
- Two channels (venues AND sessions), peak-normalised, scale-free → Tasks 1.3, 1.5. ✓
- Deterministic venue IDs reconciling with `Venue` nodes / `venues.jsonl` → Task 1.1. ✓
- `playdates_schedule` demoted to flagged low-fidelity fallback → Task 1.8. ✓
- `venue_series` stored without schema change (Film props) and surfaced on the profile for Phase 3 → Tasks 1.6–1.7. ✓
- Credentials gitignored from commit one → Task 0.1 Step 3. ✓
- Legacy MXID discovery connector + real dump are external dependencies, explicitly deferred (not silently skipped). ✓

**Deferred to Plan 2:** introspection endpoint/panel (Phase 2), venue DTW + stability gates (Phase 3), weighting + unverified marking (Phase 4), `legacy_discovery.js`, screenings.

**Type consistency:** `filmVenueSeries(showtimes)` returns `{ venues, dropped, series:{ weeks, venuesRaw, sessionsRaw, venues, sessions } }` — consumed unchanged by `ingestDump` (Task 1.6), the API (Task 1.9 Step 2), and the `VenueSeries` TS type (Task 1.9 Step 3). `venueId(name, city, country)` signature is identical across Tasks 1.1 and 1.5. `parseTimestamp(raw, year)` defined and used only in Task 1.8.

**Note for the executor:** before wiring Task 1.9 Step 2, verify whether `repo.js`'s `getNode` returns `props` as an object or a JSON string, and parse accordingly (called out inline).
