# Running your own instance

FilmGraph is designed to be self-hosted. Every instance runs the same public
schema and can ingest the same public seed data.

## Environment variables

Copy `.env.example` to `.env` and fill in values. **Never commit `.env`.**

| Variable | Required | Used by | Notes |
| --- | --- | --- | --- |
| `NEO4J_URI` | yes | engine, API | e.g. `bolt://localhost:7687` |
| `NEO4J_USER` | yes | engine, API | e.g. `neo4j` |
| `NEO4J_PASSWORD` | yes | engine, API | Your Neo4j password |
| `TMDB_API_KEY` | for films | `seed/films/tmdb_fetch.py` | Your own TMDB key; see TMDB terms |
| `TMDB_CACHE_PATH` | no | TMDB fetch | Defaults to `./cache/tmdb` |
| `FILMGRAPH_API_KEY` | no | API, sync | Enables the 600 req/min tier and sync registration |
| `FILMGRAPH_SYNC_KEY` | no | sync | Protects `POST /sync/notify` (GitHub Action) |
| `MYSQL_READ_URL` | no | `seed/venues/export.py` | Only to regenerate the venues snapshot |

## Ingest pipeline

All loaders are idempotent (MERGE, never CREATE) and resumable (file-based
checkpoints in `cache/checkpoints/`). Re-running skips records already loaded;
pass `--reset` to reload.

```bash
python -m filmgraph.engine.ingest.load_venues
python -m filmgraph.engine.ingest.load_funders
python -m filmgraph.engine.ingest.load_awards
python -m filmgraph.engine.ingest.load_distributors
python -m filmgraph.engine.ingest.load_practitioners
python -m filmgraph.engine.ingest.load_festivals          # Festival nodes
python -m filmgraph.engine.ingest.load_festivals --edges   # + SCREENED_AT from scraper output

# Films (requires TMDB_API_KEY):
export TMDB_API_KEY=...
python seed/films/tmdb_fetch.py
python -m filmgraph.engine.ingest.load_films
```

## Derived edges (enrichment)

After films, festivals, and distribution are loaded:

```bash
python -m filmgraph.engine.enrich.festival_pipeline   # FESTIVAL_PIPELINE
python -m filmgraph.engine.enrich.acquired_from       # ACQUIRED_FROM
```

## Constraints and indexes

The first ingest creates uniqueness constraints (`id` on every node type,
`tmdb_id` on Film, `iso_code` on Territory) and indexes for common lookups. On
Neo4j Community, the composite AwardBody uniqueness falls back to a composite
index automatically.

## Keeping in sync

Instances can register a webhook to receive notifications when the public repo
changes. See [the sync section of the API reference](api.md#sync). A major schema
version bump sets `requires_migration: true`; the receiving instance must approve
before ingesting.
