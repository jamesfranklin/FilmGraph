# FilmGraph Workbench — Matching & Weighting Sandbox (Design)

> Status: Design — 2026-06-09
> Owner: James Franklin
> Source spec: `05-matching-sandbox-spec.md`
> Scope of this build: **Phases 1–4** — make the venue dimension honest, with per-match introspection and weighting. Phase 5 (next dimension) and screenings ingestion are explicitly deferred.

---

## 1. Purpose

Make the matching **debuggable**. Build a lightweight, ugly-on-purpose workbench (tables and numbers, no desktop shell) that surfaces the raw data behind every match, so the distance functions and weighting can be refined against real data — starting with the one dimension worth perfecting first: **venue**.

The instrument's first job is **introspection, not tuning**: for any pair of films, show the raw data on each dimension, the representation it was turned into, and the distance computed from it. Only once you can see which dimensions are honest does weight-tuning mean anything. Build order inside the sandbox: **introspection first, dimension-fixing second, weighting third.**

---

## 2. What the codebase exploration established

These findings shaped every decision below.

- **The distance engine already exists, in JavaScript.** `FilmOS-demo/server/src/fingerprint.js` (~525 lines) is a complete, tuned engine: DTW (`dtwSim`), weighted Jaccard, normalised Levenshtein sequence similarity, a **spine-relative percentile amplitude** model (`buildPercentiles`), `absent ≠ zero` handling, breadth/confidence, and per-dimension **contributions**. It is served over an Express + SQLite sidecar (`server/src/index.js`, `/api/films/:id/similar`). The "first validation run" in the source spec was produced by this prototype, not by this repo (which has no matching code).
- **The venue dimension is the bug the spec describes — and it is not yet DTW.** Box office already computes `dtwSim` over a scale-free weekly per-screen curve (`fingerprint.js:397`). **Venue uses `weightedJaccard` over venue _names_ + geo + magnitude-closeness** (`fingerprint.js:382-388`) — pure co-presence of _which_ cinemas, with no temporal shape. This is the "festival collapses to presence" failure living inside venue.
- **The venue trajectory is recoverable but must be parsed.** The Assemble `playdates_schedule` connector (`server/src/connectors/assemble.js`) collapses each venue to a single `sessions` count + a freeform `timestamp` string. The cached strings are mostly **date ranges** — `"May 8 - May 14"` (one week), `"May 15 - May 28"` (two weeks), `"March 1 only"` (single day), `"Opens June 19"`, `"Now Playing"` — which parse into per-venue date intervals and aggregate into a weekly series.
- **Density today is thin.** 31 of 352 cached films have venue data; only ~6 are genuinely venue-dense (171 / 80 / 43 / 37 venues, then a cliff). A real distribution needs a wider cohort pull.
- **The non-desktop web path already exists.** `npm run dev` runs the API + web app on `localhost:1420` with no Tauri — "the exact frontend the Tauri shell renders" (FilmOS-demo README). Stripping the desktop shell is not surgery; we lift that path and drop `src-tauri/`.

---

## 3. Architecture decisions

| Decision | Choice | Why |
|---|---|---|
| Where compute lives | **Node sidecar that emits a trace the UI renders** | The UI computes nothing; it renders the trace. Single source of truth for the math. |
| Engine strategy | **Lift & extend the existing JS engine** — do not re-port to Python | Avoids re-porting 525 lines of tuned math (drift risk; violates "don't rewrite working code"). The spec needs no upstream write-back until venue is _proven_; then port that one function as a deliberate Python PR. |
| Repo location | **New `workbench/` in this repo (`FilmGraph-workbench`)** | Matches the repo the spec names; clean "instrument, not demo" separation. |
| Data sources | Legacy API (discovery) + `playdates_schedule` (trajectory) + screenings (deferred) | See §4. |
| Venue series channels | **Two channels: active-venues AND sessions, per week, peak-normalised** | Scale-free shape comparison; richest signal for proving the dimension. |

---

## 4. Repo layout

```
workbench/
  server/                 # lifted from FilmOS-demo/server, trimmed
    src/
      fingerprint.js      # the engine — extended (venue → DTW), not rewritten
      profile.js          # profile builder — extended to read venue weekly series
      explain.js          # NEW: emits the per-dimension introspection trace
      connectors/
        assemble.js       # EXTENDED: parse timestamp strings → weekly two-channel series
        legacy_discovery.js  # NEW: pull new film IDs via Assemble MXID (cohort widening)
        tmdb.js mrqe.js boxoffice.js   # lifted as-is
      index.js            # trimmed API: films, similar, + /explain
    data/                 # gitignored: filmos.db, cache/, *.local.json
  src/                    # fresh minimal Vite UI — tables & numbers
    App.tsx               # film picker → ranked matches → introspection panel
    Introspection.tsx     # NEW: raw → representation → distance → contribution
    Weights.tsx           # lifted from Comparables.tsx weight controls
  package.json            # concurrently dev:server + dev:web (existing pattern)
  .env                    # creds, gitignored from commit one
```

**Dropped** (out of scope per spec): `src-tauri/`, `src/desktop/*`, `TrajectoryChart` streamgraph, the AppStore/Finder/Contacts/Exchange apps.
**Kept**: the engine, the connectors, the SQLite graph store, the `concurrently` dev setup.

---

## 5. Phase 1 — The denser cohort + the venue series

The load-bearing data work. Three inputs:

1. **Legacy API (by Assemble MXID) → film discovery.** A new `legacy_discovery.js` connector pulls the list of films to add to the spine (the cohort-widening source). It returns _which films_, not showtimes.
2. **`playdates_schedule` → venue trajectory.** For each discovered/cohort film, the existing endpoint returns per-venue records. We **extend `assemble.js`** with a `timestamp`-string parser:
   - `"May 8 - May 14"` → 1-week interval; `"May 8 - May 21"` → 2 weeks; `"March 1 only"` → single day; `"Opens June 19"` → open-ended from a date; `"Now Playing"` → active-at-pull-time (flagged imprecise); unparseable → recorded as unparsed (visible in introspection, not silently dropped).
   - Per-venue intervals aggregate into a **film-level weekly two-channel series**: per ISO week, (a) count of active venues, (b) total sessions. Peak-normalised per channel → scale-free shape.
   - Persisted on `EXHIBITED_AT` edges + a film-level `venue_series`, so the representation is inspectable and reproducible.
3. **Screenings (older films) — DEFERRED.** A separate historical source needing normalisation + venue entity-matching. Not on the critical path for venue-honesty; added as a follow-on enrichment once DTW venue is proven.

**Spine model:** Doc Society + Assemble as tags over one `films` table; matching always runs against the whole spine, never bounded by cohort.

**Done when:** venue weekly series exist across the Assemble films, the spine is venue-dense enough for a real distribution, and a venue-weighted match produces a spread of scores — not a cliff to zero.

---

## 6. Phase 2 — Per-match introspection (the core feature)

New sidecar endpoint: `GET /api/films/:id/explain/:otherId?weights=…`. It returns, per dimension, a four-layer trace, and **reuses the same `dimSimilarity` functions** so the trace can never diverge from the real score.

| Layer | Venue example |
|---|---|
| **Raw** | both films' venue lists + session counts + parsed date intervals (and any unparsed timestamps) |
| **Representation** | the weekly two-channel series (venues, sessions), peak-normalised |
| **Distance** | the 0–1 similarity **and which function produced it** (`weightedJaccard` pre-Phase-3, `dtwSim` after) |
| **Contribution** | `distance × weight ÷ weightUsed` — its share of the composite |

The UI (`Introspection.tsx`) renders this as tables and numbers, with tiny inline sparklines for the series (a diagnostic, not streamgraph beauty). It must make the known failures _visible_: open a "100% festival" match and the raw layer shows both films merely _have_ a festival, not that their runs are close; open the box-office "95% then a cliff" and the coverage artifact is legible.

**Done when:** any match opens to raw → representation → distance → contribution for every dimension, so you can say "this dimension is honest" or "this dimension is lying" with evidence.

---

## 7. Phase 3 — Fix the venue dimension to honesty

With introspection live, swap venue's distance from co-presence to shape. Box office's `dtwSim` (`fingerprint.js:409`) is the working template.

- Compute venue distance as **DTW over the two-channel weekly series** (venues + sessions), each peak-normalised → comparing _shape_ of expansion/contraction, not co-presence and not magnitude.
- A 40-venue film and a 4-venue film with the same expansion curve score as **similar** (shape, not scale).
- Keep geo/footprint overlap as a **secondary, down-weighted** signal, not the primary — and make that weighting visible in the trace.
- **Verification gates** (each a test):
  - Continuous outputs (no round-number clustering).
  - Scale-invariance (the 40-vs-4 venue test).
  - **Perturbation check:** nudge the DTW parameters and confirm rankings reorder _proportionally_ (small change → small reorder), not chaotically. If chaotic → the function is unstable; fall back to **banding (low/med/high)** instead of continuous, per spec.

**Done when:** venue matches on the dense cohort are coherent to someone who knows the films, continuous, shape-based, and stable to small parameter changes. The first honest limb.

---

## 8. Phase 4 — Weighting, now that one dimension is honest

The weight controls already exist (`Comparables.tsx:112`); we lift and adjust them.

- Per match, show **absolute** breadth/confidence (n of 8 dimensions) — already in the engine (`sharedDimensions`, `confidenceFor`). Absolute, never relative to what this dataset happens to carry.
- Mark untrusted dimensions (festival, box office, window, press, market, practitioner) explicitly as **"unverified"** so a weight applied to them is visibly suspect.
- **Reset-to-defaults = venue-weighted** — not the current festival-heavy default (`fingerprint.js:38-47`).

**Done when:** the default (venue-weighted) configuration produces coherent matches with no hand-tuning, and turning up an unverified dimension visibly degrades trust rather than silently producing artifacts.

---

## 9. Testing

Node test runner, written alongside the code (per workflow):

- `timestamp` → interval parser: a table of real strings drawn from the Assemble cache (`"May 8 - May 14"`, `"March 1 only"`, `"Opens June 19"`, `"Now Playing"`, plus malformed inputs).
- Weekly two-channel series aggregation (interval overlap → per-week counts; peak-normalisation).
- `dtwSim` shape-invariance (scaled-but-same-shape series → high similarity; same-scale-different-shape → low).
- Perturbation stability (small parameter nudge → bounded ranking change).
- `explain` trace fidelity: the trace's per-dimension distance equals `similarity()`'s for the same pair/weights.

Typecheck clean. No edits to lifted-as-is engine internals beyond the venue distance swap; if a deeper change becomes unavoidable, flag for review rather than silently rewriting.

---

## 10. Scope boundaries

**In scope:** Phases 1–4 — venue honest + per-match introspection + weighting with unverified marking.

**Out of scope (per spec):**
- Phase 5 (next dimension, likely press via MRQE) — the repeatable pattern, not built here.
- Screenings ingestion + its venue entity-matching (deferred to a later pass).
- Desktop shell, dock, streamgraph beauty.
- Trusting festival / box office / market / practitioner / community — present for introspection, marked unverified.
- Multi-dimension composite tuning before venue is honest.
- Learned/embedding models — hand-coded, introspectable distance functions only.
- Write-back to FilmGraph core — except one deliberate Python PR of the venue function _once proven_.

---

## 11. Security & discipline

- Credentials in `workbench/.env`, gitignored from commit one. `gitleaks` before first push.
- All work on a feature branch; PR for Copilot review; never commit to main/staging; never deploy.
- Document as the build progresses.

---

## 12. Open dependencies (needed at implementation time)

- **Legacy discovery API:** endpoint, auth, and how an Assemble **MXID** maps to a film (and to TMDB id, for cross-referencing TMDB / box office / press). Needed to build `legacy_discovery.js`.
- **Cohort list / density target:** how many films, and the source of the MXIDs to expand the venue-dense spine.
- **`playdates_schedule` auth/limits** for a wider pull than the cached set.

---

## 13. Done when (the whole build)

- The workbench holds Doc Society + Assemble cohorts on one spine, venue-dense.
- Any match opens to raw → representation → distance → contribution per dimension.
- The venue dimension is demonstrably honest: shape-based DTW on the weekly two-channel series, continuous, stable to perturbation, coherent to someone who knows the films.
- Default (venue-weighted) matching produces sensible comparables with no hand-tuning.
- Unverified dimensions are visibly marked, so their scores cannot masquerade as trustworthy.
- You can state, with evidence from introspection, which dimensions are honest and which are not — "venue is true, the rest are pending."
