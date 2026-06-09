# FilmGraph

**FilmGraph is a decentralised open data standard for independent film.**

Anyone can run a node. Anyone can contribute. Anyone can build on top. Privacy is structural, the data is owned by whoever contributed it. The combined intelligence belongs to everyone.

FilmGraph offers an open graph schema for the independent film ecosystem. It is built on a heterogeneous graph, a structure that models not just films, but the edges between them. Who booked what, which festival led to which deal, which applications succeeded and which were declined are where the intelligence lives in the form of graph weighting. Sharing and exchange is enabled because the learned weight configuration means the underlying data remains fully private.

Its founding principle is that **FilmGraph models a release, not a film** — every entity and relationship is included because it influences whether and how a film moves through the world and finds its audience.

> This repository is the **public skeleton** — schema, public seed data, and the
> tooling to run your own instance. It contains no proprietary data and
> no enrichment that depends on private sources.

## The FilmOS project is based on this data standard.

Looking for an easy way to join in? The FilmOS project aims to create a desktop app that allows anyone to easily run their own FilmGraph node and exchange. The wider community can then both use and contribute to the FilmGraph collective knowledge. In addition it allows for the sharing of private data by sharing the weighting within the graph not the actual dataset which remains local to each contributor.

FilmGraph and FilmOS introduces five original contributions:

1. A **negative space data model** — the first structured attempt to record what was attempted in a film's release as well as what succeeded, alongside a two-layer privacy architecture that makes contributor data structurally safe to share.
2. A **practitioner taxonomy** classifying the professional roles responsible for independent film distribution — the people who move films through the world, currently invisible in every existing data model.
3. A **release window taxonomy** providing standard vocabulary for the contexts through which films are made available, where none currently exists.
4. A **Composite Release Fingerprint** — a weighted combination of nine independent sub-fingerprints (production, festival, market, practitioner, venue, box office, press, platform, community), each derived from a distinct layer of the graph. The published artifact is the learned weight configuration, not the training data — a privacy-preserving model publication scheme where the intellectual contribution is fully shareable and the underlying data remains fully private.
5. A **model layer and Exchange** — a registry of contributed weight configurations and algorithms that run locally against any FilmGraph node.

Version 0.1. Contributions and suggestions welcome.

Apache 2.0 licensed. Published as independent open infrastructure.

---

## What's here

| Area | Path | Description |
| --- | --- | --- |
| Schema | [`schema/`](schema/) | Versioned JSON Schema (`v1`) plus human-readable docs |
| Seed data | [`seed/`](seed/) | Public, committed seed datasets and ingest scripts |
| Engine | [`filmgraph/engine/`](filmgraph/engine/) | Validation, Neo4j ingest, enrichment, export |
| API | [`filmgraph/api/`](filmgraph/api/) | Thin read-only FastAPI over the public graph |
| Sync | [`filmgraph/sync/`](filmgraph/sync/) | Webhook receiver for instance sync |
| Models | [`filmgraph/models/`](filmgraph/models/) | Model-layer manifests and converters |

## Two-layer model

- **Layer 1 — public skeleton (this repo).** Schema and public seed data.
- **Layer 2 — private contributor layer.** Showtimes data, campaign data, and
  booking economics. Never published. Reserved edges such as `EXHIBITED_AT` are
  *defined* in the schema but only populated in Layer 2.

## Quickstart (under 10 minutes)

Requires Docker and Python 3.12.

```bash
# 1. Clone and configure
git clone https://github.com/jamesfranklin/filmgraph.git
cd filmgraph
cp .env.example .env
# edit .env and set NEO4J_PASSWORD

# 2. Start Neo4j + API
docker-compose up -d

# 3. Load the committed venue seed
pip install -r requirements.txt
python -m filmgraph.engine.ingest.load_venues

# 4. Query it
curl "http://localhost:8000/venues/search?q=watershed&country=GB"
curl "http://localhost:8000/schema/version"
```

See [`docs/getting-started.md`](docs/getting-started.md) and
[`docs/running-your-own-instance.md`](docs/running-your-own-instance.md) for the
full walkthrough.

## Validating contributed data

Every committed `.jsonl` seed file is schema-validated in CI. To check a file
locally:

```bash
python -m filmgraph.engine.validate.validate_file --file seed/venues/venues.jsonl --type Venue
```

## Security

- No API keys, credentials, or secrets are committed. All credentials are read
  from environment variables only.
- `.env`, `.env.*`, and `cache/` are gitignored from the first commit.
- `.env.example` carries placeholder values only.

## Contributing

See [`docs/contributing.md`](docs/contributing.md).

## License

[Apache License 2.0](LICENSE).
