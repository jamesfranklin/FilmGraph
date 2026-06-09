# Contributing

FilmGraph is open infrastructure. Contributions to the public skeleton are
welcome — schema improvements, seed data with verifiable provenance, ingest
tooling, and converters.

## Ground rules

- **No secrets, ever.** No API keys, credentials, or tokens in the repo. All
  credentials are read from environment variables. `.env` and `cache/` are
  gitignored.
- **Public data only.** Only contribute records with verifiable public
  information. No private individuals or unannounced entities. Seed records that
  require it (e.g. Practitioner) must carry a `_source`.
- **The public skeleton stays public.** This repo never contains proprietary
  showtimes data. Reserved edges (`EXHIBITED_AT`, `SHAPE_MATCHES`) are defined
  but not populated here.

## Validation gate

Every committed `.jsonl` seed file is validated against the schema in CI
([`.github/workflows/validate.yml`](../.github/workflows/validate.yml)). A file
with a schema error fails the PR. Run it locally first:

```bash
python -m filmgraph.engine.validate.validate_file --glob "seed/**/*.jsonl"
pytest -q
```

## Adding seed data

Each seed directory has a `schema.md` describing its format. Append your records,
validate, and open a PR.

## Schema changes

Additive changes (new optional properties, new node/edge types) are minor version
bumps. Update `schema/v1/*.json`, the human-readable docs, and append to
[`schema/CHANGELOG.md`](../schema/CHANGELOG.md). Breaking changes require a major
version and a migration script — discuss in an issue first.

## Models

The model layer (scoped scoring functions) is documented in
[`filmgraph/models/README.md`](../filmgraph/models/README.md). Models declare the
node/edge types they read and default to no network access.

## Workflow

Branch → PR. CI must pass. Keep changes focused; document as you go.
