# The model layer

A FilmGraph **model** is a small, scoped function that reads part of the graph
and returns an output — a ranking, a classification, a prediction. The first
Assemble models (theatre-matching-ranker, release-shape-classifier,
festival-pipeline-predictor) are weighted scoring functions, not ML models: they
are tuned by parameter adjustment against known-good outputs from experienced
distributors. No ML infrastructure is required for v1.

## Two structural guarantees

These are enforced by the runtime (FilmOS), not by policy:

1. **Data scoping.** A model can only read the node and edge types it declares in
   its manifest `requires` field. FilmOS pre-filters the graph before passing it
   to the model — it never gets raw database access. A model that declares
   `edges: ["EXHIBITED_AT", "SCREENED_AT"]` cannot read anything else, even if it
   exists on the local graph.

2. **Network isolation.** `network_access: false` is the default in every
   manifest. A model with this setting cannot make outbound network calls during
   execution. A model that needs network access must declare it, and the
   installer prompts the filmmaker for approval before installation.

The privacy promise this enables: a model can only see what it declared it
needs, it cannot phone home, and it leaves a readable audit trail. **Models are
functions, not services** — scoped input in, output out, with no persistent
connection to the publisher after the Exchange transaction.

## Manifest

Every model ships a `manifest.json` validated against
[`manifest-schema.json`](manifest-schema.json). See [`example/`](example/) for a
complete, runnable example:

- [`example/manifest.json`](example/manifest.json) — declares identity, the
  `requires` scope, `network_access: false`, and tunable `parameters`.
- [`example/scorer.py`](example/scorer.py) — the `score` entrypoint: a
  transparent weighted scoring function.

```python
from filmgraph.models.example.scorer import score

context = {
    "film": {"id": "...", "origin_country": ["GB"]},
    "venues": [{"id": "v1", "country": "GB", "is_independent": True}],
    "screened_at": [{"year": 2023}],
}
ranking = score(context)
```
