# FilmGraph Node Types (v1)

FilmGraph models a *release*. Every node type exists because it influences whether
and how a film finds its audience. Machine-readable definitions:
[`schema/v1/nodes.json`](v1/nodes.json).

Conventions:

- `id` is a UUID string unless noted otherwise.
- `country` / `territory` values are ISO 3166-1 alpha-2 codes (e.g. `GB`, `US`).
- All node records may carry an optional `_source` provenance string; for
  manually curated seeds it documents where the record came from. It is required
  for `Practitioner` seed records and is stripped before Neo4j ingest.
- FilmGraph is a **global** standard — no geographic scope restrictions.

---

## Film

| Property | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | UUID | yes | |
| `tmdb_id` | integer | yes | Unique (enforced by DB constraint) |
| `imdb_id` | string | no | |
| `title` | string | yes | |
| `year` | integer | yes | |
| `origin_country` | string[] | no | ISO alpha-2 |
| `language` | string | no | |
| `genres` | string[] | no | |
| `budget_tier` | enum | no | `low` / `mid` / `high` |
| `runtime_mins` | integer | no | |
| `keywords` | string[] | no | |
| `vote_average` | number | no | |
| `vote_count` | integer | no | |
| `letterboxd_rating` | number | no | |
| `letterboxd_watchlist_count` | integer | no | |

## Venue

| Property | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | UUID | yes | |
| `name` | string | yes | |
| `city` | string | yes | |
| `country` | string | yes | ISO 3166-1 alpha-2 |
| `address` | string | no | |
| `state` | string | no | |
| `postal_code` | string | no | |
| `chain_id` | string | no | |
| `is_independent` | boolean | no | |
| `latitude` | number | no | |
| `longitude` | number | no | |
| `website` | string | no | |

## Festival

Festivals **select** films — a programmer chooses.

| Property | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | UUID | yes | |
| `name` | string | yes | |
| `city` | string | yes | |
| `country` | string | yes | ISO alpha-2 |
| `tier` | enum | yes | `a_list` / `major` / `regional` / `specialist` |
| `festival_type` | enum | yes | `film` / `documentary` / `genre` / `short` / `international` |
| `website` | string | no | |
| `founded_year` | integer | no | |

## Market

Markets **sell** films — a sales agent brings. Distinct from Festivals even when
co-located (link via `parent_festival_id`).

| Property | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | UUID | yes | |
| `name` | string | yes | e.g. "Cannes Marché du Film", "EFM", "AFM" |
| `city` | string | yes | |
| `country` | string | yes | ISO alpha-2 |
| `market_type` | enum | yes | `general` / `documentary` / `genre` / `shorts` / `series` |
| `parent_festival_id` | UUID | no | Links to a co-located Festival node |
| `website` | string | no | |

## AwardBody

| Property | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | UUID | yes | |
| `name` | string | yes | e.g. "Academy of Motion Picture Arts and Sciences" |
| `short_name` | string | yes | e.g. "Academy Awards" |
| `country` | string | yes | ISO alpha-2 |
| `founded_year` | integer | no | |
| `website` | string | no | |

## AwardCategory

| Property | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | UUID | yes | |
| `award_body_id` | UUID | yes | |
| `name` | string | yes | e.g. "Best Documentary Feature" |
| `discipline` | enum | no | `directing` / `acting` / `writing` / `craft` / `production` / `documentary` / `international` / `other` |

## Distributor

| Property | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | UUID | yes | |
| `name` | string | yes | |
| `territory` | string[] | yes | Territories where they operate (ISO alpha-2) |
| `type` | enum | no | `major` / `indie` / `self` / `hybrid` |
| `website` | string | no | |
| `founded_year` | integer | no | |
| `parent_organisation_id` | UUID | no | For subsidiaries |

## Practitioner

| Property | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | UUID | yes | |
| `name` | string | yes | |
| `role` | enum | yes | `booker` / `marketer` / `sales_agent` / `impact_producer` / `distributor_exec` / `commissioning_exec` / `publicist` / `programmer` |
| `organisation_id` | UUID | no | |
| `territory` | string[] | no | ISO alpha-2 |
| `website` | string | no | |
| `_source` | string | yes (seed) | Provenance, required for contribution review |

## Organisation

| Property | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | UUID | yes | |
| `name` | string | yes | |
| `type` | enum | yes | `sales_agent` / `funding_body` / `marketing_agency` / `impact_org` / `cinema_chain` / `production_company` / `platform` |
| `territory` | string[] | no | ISO alpha-2 |
| `website` | string | no | |

## Platform

| Property | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | string | yes | Slug, e.g. `mubi` (not a UUID) |
| `name` | string | yes | |
| `platform_type` | enum | yes | `svod` / `tvod` / `avod` / `community_screening` / `impact` / `educational` |
| `territory` | string[] | no | ISO alpha-2 |
| `website` | string | no | |

## Publication

Target of the `REVIEWED` edge — a critical outlet or trade press.

| Property | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | UUID | yes | |
| `name` | string | yes | e.g. "Variety", "Sight & Sound", "The Guardian" |
| `country` | string | no | ISO alpha-2 |
| `publication_type` | enum | no | `trade` / `national` / `regional` / `critic` / `blog` / `aggregator` / `other` |
| `website` | string | no | |

## Territory

Primary key is `iso_code` (not `id`).

| Property | Type | Required | Notes |
| --- | --- | --- | --- |
| `iso_code` | string | yes | ISO 3166-1 alpha-2, primary key |
| `name` | string | yes | |
| `market_type` | enum | no | `major` / `mid` / `small` |
