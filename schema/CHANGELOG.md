# Schema Changelog

All schema changes are recorded here.

Versioning rules:

- **Minor (v1.1, v1.2):** additive only — new optional properties, new node/edge
  types. Never remove or rename. Instances auto-sync safely.
- **Major (v2):** breaking changes require a migration script at
  `schema/v2/migrate_from_v1.py`. Instances must approve before syncing.

## [1.1.0] — 2026-10-29

Additive. Introduces node-portable film identity and the node contract.

### Film

- **Added `slug`** (required) — derived match key `<english-title>-<year>[-<n>]`
  so independent nodes arrive at the same identifier without a registry.
  Derivation and collision rules in `docs/node-contract.md`.
- **Added `external_ids`** (optional object) — `tmdb`, `imdb`, `letterboxd`,
  `wikidata`, `eidr`, plus any operator-specific key. Resolution matches on these before `slug`.
- **Added `title_en`** (nullable) and `original_title`.
- **Added `_ext`** (optional object) to every node type — node-specific
  extras, ignorable by consumers; see `docs/node-contract.md#envelope`.
- **`tmdb_id` is no longer required.** It was the de facto primary key; many
  independent films — documentaries above all — have no TMDB record. `tmdb_id`
  and `imdb_id` remain valid, deprecated in favour of `external_ids`.
  Strictly this relaxes a `required` constraint, which a consumer could treat
  as breaking; no consumer depended on it, so this ships as a minor.

### Node contract (new, `docs/node-contract.md`)

- `GET /.well-known/filmgraph` node manifest.
- `GET /films/{ref}` accepts a UUID, a slug, or a prefixed external id
  (`tmdb:496243`).
- `GET /films/{ref}/graph` — composite film document: node plus edges grouped
  by type with far nodes inlined.
- `GET /films/resolve` — multi-strategy match with confidence.
- Fixed MCP tool set every node exposes.
- Conformance suite under `conformance/`.

## [1.0.0] — 2026-06-02

Initial public schema.

### Node types

Film, Venue, Festival, Market, AwardBody, AwardCategory, Distributor,
Practitioner, Organisation, Platform, Publication, Territory.

### Edge types

SCREENED_AT, NOMINATED_FOR, WON, DISTRIBUTED_BY, WORKED_ON, FUNDED,
REPRESENTED_BY, MEMBER_OF, EMPLOYED_BY, ACQUIRED_FROM, REVIEWED, AVAILABLE_ON,
LOCATED_IN, CO_PROGRAMMES_WITH, SIMILAR_TO, FESTIVAL_PIPELINE.

Reserved (defined, not populatable in the public layer): EXHIBITED_AT,
SHAPE_MATCHES.

The `REVIEWED` edge targets the `Publication` node type, which is defined in this
initial schema.
