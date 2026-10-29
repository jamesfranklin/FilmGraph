# API reference

The FilmGraph API is **read-only** and rate limited. Interactive docs are served
at `/docs` (Swagger) and `/redoc`.

This page documents the reference node. The behaviour every node must share —
manifest, film identity and references, the composite document, MCP tools,
conformance — is specified in [`node-contract.md`](node-contract.md).

## Envelope

Every data response is wrapped:

```json
{ "schema_version": "1.1.0", "data": { ... } }
```

List responses carry pagination metadata:

```json
{ "schema_version": "1.1.0", "data": { "page": 1, "limit": 20, "count": 42, "items": [ ... ] } }
```

All list endpoints accept `?page=1&limit=20` (max `limit` 100).

## Rate limits

- No API key: **60 requests / minute** (per client IP).
- Valid API key: **600 requests / minute**.

Supply the key as the `X-API-Key` header or `?api_key=` query parameter. The key
is the value of `FILMGRAPH_API_KEY`. Exceeding the limit returns `429`.

Set `FILMGRAPH_NODE_AUTH=required` to run the reference as a private node: every
path except the manifest and schema then returns `401` without a valid key.

## Errors

```json
{ "schema_version": "1.1.0", "error": "not_found", "detail": "Film tmdb:1 not found" }
```

Codes: `bad_request` (400), `unauthorized` (401), `forbidden` (403),
`not_found` (404), `rate_limit_exceeded` (429).

## Endpoints

### Meta
| Method | Path | Description |
| --- | --- | --- |
| GET | `/` | Health check + schema version |
| GET | `/.well-known/filmgraph` | Node manifest (always unauthenticated) |
| GET | `/schema` | Full schema (node + edge types inlined) |
| GET | `/schema/version` | Schema version string |

### Films

`{ref}` is a UUID, a slug (`parasite-2019`) or a prefixed external id
(`tmdb:496243`, `imdb:tt6751668`, `wikidata:Q61448040`). Bare integers are not accepted.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/films/search?q=` | Title search |
| GET | `/films/resolve?title=&year=&tmdb=&imdb=…` | Multi-strategy match with confidence |
| GET | `/films/{ref}` | Film node |
| GET | `/films/{ref}/graph` | Composite document: film + edges grouped by type |
| GET | `/films/{ref}/festivals` | Festival screenings |
| GET | `/films/{ref}/awards` | Nominations and wins |
| GET | `/films/{ref}/distributors` | Distribution by territory |
| GET | `/films/{ref}/similar` | Similar films |

### Venues
| Method | Path | Description |
| --- | --- | --- |
| GET | `/venues/search?q=&country=` | Search (optional country filter) |
| GET | `/venues/{id}` | Venue node |
| GET | `/venues/{id}/films` | Films shown here (paginated) |

### Festivals
| Method | Path | Description |
| --- | --- | --- |
| GET | `/festivals/search?q=` | Search |
| GET | `/festivals/{id}` | Festival node |
| GET | `/festivals/{id}/films?year=` | Films screened (paginated, filter by year) |

### Distributors
| Method | Path | Description |
| --- | --- | --- |
| GET | `/distributors/search?q=` | Search |
| GET | `/distributors/{id}` | Distributor node |
| GET | `/distributors/{id}/films?territory=` | Films distributed (paginated) |

### Awards
| Method | Path | Description |
| --- | --- | --- |
| GET | `/awards/{id}` | AwardBody node |
| GET | `/awards/{id}/categories` | Award categories |
| GET | `/awards/{id}/films?year=` | Films nominated/winning in a year |

### Practitioners & organisations
| Method | Path | Description |
| --- | --- | --- |
| GET | `/practitioners/{id}` | Practitioner node |
| GET | `/practitioners/{id}/films` | Films worked on |
| GET | `/organisations/{id}` | Organisation node |
| GET | `/organisations/{id}/films` | Films funded/represented |

### Territories
| Method | Path | Description |
| --- | --- | --- |
| GET | `/territories` | All territories |
| GET | `/territories/{iso_code}` | Territory detail |

## Sync

Instances can subscribe to change notifications.

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/sync/register` | `X-API-Key` | Register a webhook endpoint; returns a token |
| GET | `/sync/{token}` | token | Fetch delta data for a sync event |
| POST | `/sync/notify` | `X-Sync-Key` | Internal (GitHub Action); fans the payload out to registered instances |

A receiving instance checks `requires_migration` before ingesting. Major version
bumps must be approved at the receiving instance.
