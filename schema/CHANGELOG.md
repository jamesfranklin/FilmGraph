# Schema Changelog

All schema changes are recorded here.

Versioning rules:

- **Minor (v1.1, v1.2):** additive only — new optional properties, new node/edge
  types. Never remove or rename. Instances auto-sync safely.
- **Major (v2):** breaking changes require a migration script at
  `schema/v2/migrate_from_v1.py`. Instances must approve before syncing.

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
