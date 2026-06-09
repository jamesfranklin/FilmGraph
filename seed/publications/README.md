# Publications seed

Curated public **reference** data for the `Publication` node type — film trade
press, national outlets, critics, aggregators, and blogs. These are well-known
public outlets; nothing here is derived from any proprietary source.

| File | Committed? | Notes |
| --- | --- | --- |
| `publications.jsonl` | **yes** | One `Publication` node per line. |

## What this is (and isn't)

- A small reference set so the `Publication` node type and the `publication_type`
  taxonomy (`trade / national / regional / critic / blog / aggregator / other`)
  are populated out of the box.
- **Not** a set of reviews. No `REVIEWED` (Film→Publication) edges are seeded —
  FilmGraph has no public review data source. Reviews belong to a downstream /
  proprietary layer.

## IDs

`id` values are stable UUIDv5s baked into the file, matching the
`distributors.jsonl` convention. They are generated once from the publication
name so re-deriving them is reproducible and ingest stays idempotent:

```python
import uuid
NS = uuid.uuid5(uuid.NAMESPACE_URL, "https://filmgraph.org/schema/v1/publication")
pub_id = str(uuid.uuid5(NS, name.lower()))
```

## Loading it

```bash
python -m filmgraph.engine.ingest.load_publications
```

The loader is idempotent (MERGE) and validates every record against the
`Publication` schema before writing.
