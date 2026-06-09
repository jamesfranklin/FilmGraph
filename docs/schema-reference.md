# Schema reference

The FilmGraph schema is the contract everything builds against. It is versioned
and lives in [`schema/`](../schema/).

- Machine-readable: [`schema/v1/filmgraph.json`](../schema/v1/filmgraph.json),
  [`nodes.json`](../schema/v1/nodes.json), [`edges.json`](../schema/v1/edges.json)
- Human-readable: [`nodes.md`](../schema/nodes.md), [`edges.md`](../schema/edges.md)
- Changes: [`CHANGELOG.md`](../schema/CHANGELOG.md)

## Founding principle

FilmGraph models a **release**, not a film. Every node and edge is included
because it influences whether and how a film finds its audience. The test for
inclusion: *does this entity affect the release trajectory?*

## Node types (12)

Film, Venue, Festival, Market, AwardBody, AwardCategory, Distributor,
Practitioner, Organisation, Platform, Publication, Territory.

Full property tables are in [`nodes.md`](../schema/nodes.md). Conventions:

- `id` is a UUID string (Platform uses a slug; Territory is keyed by `iso_code`).
- `country` / `territory` are ISO 3166-1 alpha-2 codes.
- Records may carry an optional `_source` provenance string (required on
  Practitioner seed records, stripped before ingest).

## Edge types

16 public edges plus 2 reserved. Full table in [`edges.md`](../schema/edges.md).
Key distinctions:

- **Festivals select** films (`SCREENED_AT`); **Markets sell** films.
- **Derived** edges (`FESTIVAL_PIPELINE`, `ACQUIRED_FROM`, `SIMILAR_TO`,
  `CO_PROGRAMMES_WITH`) are produced by enrichment, not contributed directly.
- **Reserved** edges (`EXHIBITED_AT`, `SHAPE_MATCHES`) are defined in the schema
  but require the Assemble proprietary layer to populate. The public engine
  refuses to load them.

## Versioning

- **Minor (v1.1, v1.2):** additive only — new optional properties, new node/edge
  types. Never remove or rename. Instances auto-sync safely.
- **Major (v2):** breaking changes require a migration script at
  `schema/v2/migrate_from_v1.py`. Instances must approve before syncing.

All changes are appended to [`CHANGELOG.md`](../schema/CHANGELOG.md).

## Validation

Validate any record or committed file against the schema:

```bash
python -m filmgraph.engine.validate.validate_file --file seed/venues/venues.jsonl --type Venue
python -m filmgraph.engine.validate.validate_file --glob "seed/**/*.jsonl"
```
