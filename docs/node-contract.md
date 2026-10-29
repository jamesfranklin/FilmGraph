# FilmGraph node contract (v1.1)

A **FilmGraph node** is any service that serves FilmGraph data over HTTP and
MCP according to this document. The Python reference implementation in this
repository is one node. A Cloudflare Worker over D1 is another. A thin wrapper
over a distributor's existing systems is another. They share no code — they
share this contract and pass the same [conformance suite](#conformance).

The contract is deliberately small. A node is not required to serve every node
type or edge type in the schema; it is required to *say* what it serves and to
serve that in the standard shape.

## Layers

| Layer | What it holds | Who may read | Example |
| --- | --- | --- | --- |
| **1 — public** | Schema, public seed, anything safe to publish | Anyone, rate-limited; key optional | The reference node, `filmgraph.org` |
| **2 — private** | Showtimes, campaigns, booking economics, reserved edges (`EXHIBITED_AT`, `SHAPE_MATCHES`) | Keyed consumers only, scoped per key | `filmgraph.assemble.film` |

A private node returns **the same shapes** as a public one. The only differences
are that every request needs a key and the manifest says `"layer": 2`. A node
may serve both layers, gating Layer 2 data by key scope.

## Node manifest

```
GET /.well-known/filmgraph
```

Unauthenticated, even on a private node. Returns:

```json
{
  "schema_version": "1.1.0",
  "data": {
    "node_id": "docsociety",
    "name": "Doc Society FilmGraph node",
    "operator": { "name": "Doc Society", "url": "https://docsociety.org" },
    "layer": 1,
    "auth": "required",
    "node_types": ["Film", "Organisation", "Festival"],
    "edge_types": ["FUNDED", "SCREENED_AT"],
    "capabilities": ["films.graph", "films.resolve", "mcp"],
    "mcp": { "url": "https://filmgraph.docsociety.org/mcp" },
    "film_count": 412,
    "updated_at": "2026-10-29T12:00:00Z"
  }
}
```

- `node_id` — short stable identifier, `^[a-z0-9-]+$`. Used as the `source`
  tag on anything a consumer merges from several nodes.
- `layer` — `1` or `2`.
- `auth` — `"none"`, `"optional"` (key raises the rate limit) or `"required"`.
- `node_types` / `edge_types` — subsets of the schema this node actually
  populates. A consumer must not assume anything not listed.
- `capabilities` — strings from this list: `films.graph`, `films.resolve`,
  `films.search`, `venues`, `festivals`, `distributors`, `mcp`, `sync`.
- `mcp` — present when `mcp` is in `capabilities`.
- `film_count`, `updated_at` — optional, informational.

## Authentication

- Header `X-API-Key: <key>`. Query `?api_key=` is accepted for browser
  convenience and discouraged.
- Missing or invalid key on a node (or resource) that requires one → `401`
  with the standard error envelope. Never `403` for a bad key; `403` is for a
  valid key that lacks scope.
- Keys are opaque strings issued by the node operator. **One key per
  consumer.** How keys are stored and scoped is the node's business; the
  contract only fixes the header and the status codes.
- A private node **must** support scoping a key to a subset of films. Out of
  scope → `404`, not `403` (don't leak existence).
- Rate limits are per key (or per IP when anonymous). Exceeding → `429` with
  `Retry-After`.

## Envelope

Unchanged from v1:

```json
{ "schema_version": "1.1.0", "data": { ... } }
{ "schema_version": "1.1.0", "data": { "page": 1, "limit": 20, "count": 42, "items": [ ... ] } }
```

Errors:

```json
{ "schema_version": "1.1.0", "error": "not_found", "detail": "Film tmdb:1 not found" }
```

`error` is a stable snake_case code: `not_found`, `unauthorized`, `forbidden`,
`rate_limit_exceeded`, `bad_request`, `unsupported`. `detail` is for humans.

Every `Film` node returned by any endpoint **must validate** against
`schema/v1/nodes.json#/Film`. Unknown properties are rejected by the schema
(`additionalProperties: false`); node-specific extras go under `_ext`.

> `_ext` is reserved for node-specific data a consumer may ignore. It is the
> only escape hatch; use it sparingly and document it in your manifest's
> operator URL.

## Film identity

Three fields, three jobs.

| Field | Job | Who sets it | Stable? |
| --- | --- | --- | --- |
| `id` | Primary key. What edges point at. | The node, locally (UUID). | Immutable. |
| `slug` | **Match key** across nodes. Human-readable. | Derived from title + year. | Changes if title/year is corrected. |
| `external_ids` | Match key when a shared registry id exists. | Whoever knows it. | Stable per system. |

### `id`

A UUID minted by the node. Two nodes holding the same film will have
**different** `id`s; that is expected. When a TMDB id is known, use
`uuid5(FILM_NAMESPACE, "tmdb:<id>")` (see `filmgraph/engine/ingest/ids.py`) so
nodes that both know the TMDB id happen to agree; otherwise
`uuid5(FILM_NAMESPACE, "slug:<slug>")` or any UUID you can keep stable.

### `slug`

```
<title>-<year>[-<n>]
```

Derivation (reference: `film_slug()` in `ids.py`):

1. Start from the **English title** if one exists, else the original title
   romanised. Set `title_en: null` in the latter case.
2. Replace `&` with ` and `; delete apostrophes (`Don't` → `dont`).
3. NFKD-normalise and drop non-ASCII (`Amélie` → `amelie`).
4. Lowercase; collapse every run of non-alphanumerics to a single `-`; trim.
5. **Keep leading articles.** `the-end-of-the-line-2009`, not `end-of-the-line`.
6. Append `-<year>` — four digits.
7. Append `-<n>` (n ≥ 2) **only** when this node already holds a different
   film with the same slug. The suffix is per-node and carries no meaning
   across nodes.

   A node that keeps a unique-slug index (the reference, the template)
   **MUST** assign the suffix at ingest, so every stored film has one stable
   slug. A node that resolves against stores it does not own, with no index of
   its own, **MAY** instead return the bare slug for every film that shares it,
   provided that: `GET /films/<slug>` returns one of them deterministically
   (the oldest by the node's own ordering) and lists the others' ids in
   `_ext.slug_collisions`; `GET /films/<slug>-<n>` returns the nth in that
   same order; and `/films/resolve` surfaces all of them (`slug` for the
   first, `slug_collision` for the rest). Either way a consumer holding only
   a slug can reach every film behind it.

Which year: the year of the film's **first public screening** (festival
premiere counts). Not copyright year, not theatrical year. When nodes disagree
by one year the resolver tolerates it (below).

The slug is **not unique across nodes** and is **not a primary key**. It is the
thing two strangers' nodes most likely agree on. The schema enforces the
pattern, not uniqueness.

### `external_ids`

Known identifiers in other systems: `tmdb` (int), `imdb` (`tt…`),
`letterboxd` (slug), `wikidata` (`Q…`), `eidr`, `mx` (Assemble). Additional
keys are allowed. `tmdb_id` / `imdb_id` at the top level are kept for v1
compatibility and are deprecated.

### Film references

Every endpoint that takes a film accepts a **reference** in any of three forms:

| Form | Example | Matches |
| --- | --- | --- |
| UUID | `3b2f…` | `id` exactly |
| Slug | `parasite-2019` | `slug` exactly (case-insensitive) |
| Prefixed external id | `tmdb:496243`, `imdb:tt6751668`, `mx:675` | `external_ids.<prefix>` |

Bare integers are **not** accepted (v1's `/films/{tmdb_id}` is retired; use
`tmdb:` explicitly). A node that cannot match a reference returns `404`.

### Resolution

```
GET /films/resolve?title=&year=&tmdb=&imdb=&…
```

Returns candidates with a confidence, best first:

```json
{ "schema_version": "1.1.0", "data": { "items": [
  { "film": { …Film node… }, "confidence": 1.0, "matched_on": "external_ids.tmdb" },
  { "film": { … }, "confidence": 0.8, "matched_on": "slug" },
  { "film": { … }, "confidence": 0.6, "matched_on": "slug_year_adjacent" }
] } }
```

Strategy order and confidence floor:

1. Any supplied external id matches → `1.0`, `matched_on: external_ids.<k>`.
2. Derived slug matches exactly → `0.8`, `slug`.
3. Other films on this node with the same base slug — stored with a
   collision suffix (`<slug>-2`, `<slug>-3`, …) or, on a node without a slug
   index, sharing the bare slug — → `0.7`, `slug_collision`. Same title, same
   year, different film: surface them so the consumer disambiguates rather
   than silently taking the first.
4. Derived slug matches with year ±1 → `0.6`, `slug_year_adjacent`.
5. Optional: node-specific fuzzy title match → `< 0.5`, `fuzzy`.

A node that implements strategies 1–4 is conformant. Empty `items` is a
`200`, not a `404`.

## Composite film document

```
GET /films/{ref}/graph
```

One request, one film, everything the node knows about it. This is what "a
JSON dataset per film" means, and what the MCP `get_film` tool returns.

```json
{
  "schema_version": "1.1.0",
  "data": {
    "node": "docsociety",
    "film": { …Film node… },
    "edges": {
      "SCREENED_AT":   [ { "edge": { …edge props… }, "target": { …Festival node… } } ],
      "DISTRIBUTED_BY":[ { "edge": { "territory": "GB", … }, "target": { …Distributor… } } ],
      "FUNDED":        [ { "edge": { … }, "target": { …Organisation… } } ],
      "EXHIBITED_AT":  [ … ]
    },
    "generated_at": "2026-10-29T12:00:00Z"
  }
}
```

- `edges` keys are edge type names from the schema. Only edge types the node
  serves for this film appear; an empty list is allowed, an absent key means
  "not served", not "none".
- Each entry is `{ "edge": <edge properties>, "target": <far node> }`. For
  edges where the film is the target (e.g. `WORKED_ON`, Practitioner → Film),
  the far node is still under `target` and `edge.direction: "in"` is set.
- `target` nodes validate against their schema type. Include `id` always.
- Layer 2 edge types appear only for keys with scope.
- Large edge sets (showtimes) may be truncated; set `edge_counts` with the
  true totals and `truncated: true` so a consumer knows to page via the
  per-edge endpoints.

The v1 per-edge endpoints (`/films/{ref}/festivals`, `/awards`,
`/distributors`, `/similar`) remain, now accepting any reference form.

## MCP

A node advertising `mcp` exposes a Streamable HTTP MCP server at the URL in
its manifest, authenticated with the same `X-API-Key` header (or
`Authorization: Bearer <key>` — accept both). The tool set is fixed:

| Tool | Args | Returns |
| --- | --- | --- |
| `node_info` | — | The manifest `data` object |
| `search_films` | `query: string`, `limit?: int` | `{ items: Film[] }` |
| `resolve_film` | `title?`, `year?`, `tmdb?`, `imdb?`, `external_ids?: object` | resolve `data` |
| `get_film` | `ref: string` | the composite document `data` |
| `search_venues` | `query`, `country?`, `limit?` | `{ items: Venue[] }` — only if `venues` capability |
| `get_venue` | `ref: string` | Venue node plus `films` — only if `venues` capability |

Rules:

- Tool names and argument names exactly as above. A node may add tools; it
  may not rename or drop these (except the two venue tools when it has no
  venues).
- Tool results are the same JSON the REST endpoints return, minus the outer
  envelope. No prose summaries — the consumer is a model, it can read JSON.
- Tool descriptions should state the node name and layer so an agent holding
  several nodes can tell them apart.
- No write tools in this contract. Sync and contribution are separate.

## Conformance

`conformance/` in this repository is a pytest suite that runs against **any**
base URL:

```bash
FILMGRAPH_NODE_URL=https://filmgraph.docsociety.org \
FILMGRAPH_NODE_KEY=… \
pytest conformance/
```

It checks the manifest, envelope and error shapes, auth behaviour, reference
resolution, the composite document, and that every returned node validates
against the schema. A node is conformant when it passes with zero skips it
didn't earn through its manifest (a node that doesn't list `venues` skips the
venue tests legitimately).

The reference implementation runs the same suite in CI against itself.

## What this contract does not fix

- Storage. Neo4j, D1, MySQL, flat files — irrelevant.
- Key issuance, rotation, billing.
- How a node ingests or refreshes data.
- Cross-node merging. A consumer that reads three nodes gets three
  `film.id`s and decides for itself using `external_ids` and `slug`.
- Write paths. Contribution to the commons is a separate document.
