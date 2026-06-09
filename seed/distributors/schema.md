# Distributors seed

`distributors.jsonl` is a static, manually curated, committed list of film
distributors. Each record is a **Distributor** node conforming to the
[Distributor schema](../../schema/nodes.md#distributor).

| Field | Required | Notes |
| --- | --- | --- |
| `id` | yes | UUID (deterministic, derived from the distributor name) |
| `name` | yes | Public company name |
| `territory` | yes | ISO 3166-1 alpha-2 codes where they operate |
| `type` | no | `major` / `indie` / `self` / `hybrid` |
| `website` | no | Public URL |
| `founded_year` | no | |
| `parent_organisation_id` | no | For subsidiaries |

Only include distributors with verifiable public information — no private or
unannounced entities. Films connect via the `DISTRIBUTED_BY` edge (Film →
Distributor) with a required `territory`.

Validate:

```bash
python -m filmgraph.engine.validate.validate_file --file seed/distributors/distributors.jsonl --type Distributor
```
