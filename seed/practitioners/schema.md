# Practitioners seed

`practitioners.jsonl` is a static, manually curated, committed list of film
ecosystem practitioners. Each record is a **Practitioner** node conforming to the
[Practitioner schema](../../schema/nodes.md#practitioner).

| Field | Required | Notes |
| --- | --- | --- |
| `id` | yes | UUID (deterministic) |
| `name` | yes | Public professional name |
| `role` | yes | `booker` / `marketer` / `sales_agent` / `impact_producer` / `distributor_exec` / `commissioning_exec` / `publicist` / `programmer` |
| `territory` | no | ISO 3166-1 alpha-2 codes |
| `website` | no | |
| `_source` | **yes (seed)** | Provenance URL/citation. Required for every seed record; stripped before Neo4j ingest. |

## Inclusion policy

Only include practitioners with **unambiguously public professional credits**. No
private individuals. Every record must carry a `_source`.

The committed seed is intentionally **conservative**: it currently lists public
festival leadership (the most publicly documented practitioner type, `role:
programmer`). It is a starter set, not exhaustive — other roles (`booker`,
`sales_agent`, `distributor_exec`, etc.) should be added via sourced
contributions, each with a verifiable `_source`.

The loader rejects any record missing `_source`.

Validate:

```bash
python -m filmgraph.engine.validate.validate_file --file seed/practitioners/practitioners.jsonl --type Practitioner
```
