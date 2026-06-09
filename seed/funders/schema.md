# Funders seed

`funders.jsonl` is a static, manually curated, committed list of film funding
bodies. Each record is an **Organisation** node with `type: funding_body`,
conforming to the [Organisation schema](../../schema/nodes.md#organisation).

Each line is one JSON object:

| Field | Required | Notes |
| --- | --- | --- |
| `id` | yes | UUID (deterministic, derived from the organisation name) |
| `name` | yes | Public organisation name |
| `type` | yes | Always `funding_body` for this seed |
| `territory` | no | ISO 3166-1 alpha-2 codes where the funder operates |
| `website` | no | Public URL |

Funders connect to films via the `FUNDED` edge (Organisation → Film), with an
optional `funding_type` of `production` / `p_and_a` / `impact` / `gap`.

Only include funders with verifiable public information. To add one, append a
line and run:

```bash
python -m filmgraph.engine.validate.validate_file --file seed/funders/funders.jsonl --type Organisation
```
