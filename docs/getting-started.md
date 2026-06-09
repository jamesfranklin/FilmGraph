# Getting started

FilmGraph is an open graph schema, public seed dataset, and tooling for the
independent film ecosystem. This guide gets you from clone to first query.

## Prerequisites

- Docker and Docker Compose
- Python 3.12 (for the ingest and seed tooling)

## 1. Configure

```bash
git clone https://github.com/jamesfranklin/filmgraph.git
cd filmgraph
cp .env.example .env
```

Edit `.env` and set at least `NEO4J_PASSWORD`. All credentials are read from the
environment — nothing is hardcoded. See the table in
[running-your-own-instance.md](running-your-own-instance.md) for every variable.

## 2. Start Neo4j and the API

```bash
docker-compose up -d
```

This starts Neo4j (ports 7474/7687) and the FilmGraph API (port 8000).

## 3. Load the public seed

```bash
pip install -r requirements.txt
python -m filmgraph.engine.ingest.load_venues
python -m filmgraph.engine.ingest.load_funders
python -m filmgraph.engine.ingest.load_awards
python -m filmgraph.engine.ingest.load_distributors
python -m filmgraph.engine.ingest.load_practitioners
python -m filmgraph.engine.ingest.load_publications
python -m filmgraph.engine.ingest.load_festivals
```

Films come from TMDB and require your own API key — see
[`seed/films/README.md`](../seed/films/README.md). The committed corpus is a
curated festival-circuit set split into `core` and `extended` tiers; pass
`--tier core` to `tmdb_fetch.py` for just the small set.

## 4. Query

```bash
curl "http://localhost:8000/schema/version"
curl "http://localhost:8000/venues/search?q=watershed&country=GB"
```

Interactive API docs are at `http://localhost:8000/docs`.

## Without Docker

The API can run directly against the committed seeds with no database — useful
for exploring the data:

```bash
pip install -r requirements.txt
uvicorn filmgraph.api.main:app --reload
```

When `NEO4J_PASSWORD` is unset, the API serves node lookups and searches from the
committed seed files (relationship traversals need a loaded Neo4j instance).

## Next steps

- [Run your own instance](running-your-own-instance.md)
- [Schema reference](schema-reference.md)
- [API reference](api.md)
- [Contributing](contributing.md)
