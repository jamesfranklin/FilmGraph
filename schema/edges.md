# FilmGraph Edge Types (v1)

Machine-readable definitions: [`schema/v1/edges.json`](v1/edges.json).

Edge records use this envelope shape for validation and ingest:

```json
{
  "edge_type": "SCREENED_AT",
  "source_id": "<source node id>",
  "target_id": "<target node id>",
  "properties": { "year": 2020, "section": "competition", "premiere_status": "world" }
}
```

`edges.json` declares, for each edge type: valid `source` and `target` node
types, the `properties` JSON Schema (with required/optional), and flags:

- `reserved: true` — defined in the schema but **not populatable** in the public
  seed graph (requires the Assemble proprietary layer).
- `derived: true` — produced by enrichment, not contributed directly.
- `bidirectional: true` — undirected relationship.

## Public edges

| Edge | Source → Target | Required props | Optional props |
| --- | --- | --- | --- |
| `SCREENED_AT` | Film → Festival | `year` | `section`, `premiere_status`, `award_won` |
| `NOMINATED_FOR` | Film → AwardCategory | `year`, `ceremony_year` | — |
| `WON` | Film → AwardCategory | `year`, `ceremony_year` | — |
| `DISTRIBUTED_BY` | Film → Distributor | `territory` | `release_date`, `deal_type` |
| `WORKED_ON` | Practitioner → Film | `role` | `year`, `territory` |
| `FUNDED` | Organisation → Film | — | `funding_type`, `year` |
| `REPRESENTED_BY` | Film → Organisation | — | `role`, `territory`, `year` |
| `MEMBER_OF` | Practitioner → Organisation | — | `start_year`, `end_year` |
| `EMPLOYED_BY` | Practitioner → Distributor | — | `role`, `start_year`, `end_year` |
| `ACQUIRED_FROM` | Distributor → Festival | — | `year`, `territory`, `film_id` (derived) |
| `REVIEWED` | Film → Publication | — | `score` (0–1), `sentiment`, `review_date` |
| `AVAILABLE_ON` | Film → Platform | `territory`, `is_active` | `link_type`, `added_date` |
| `LOCATED_IN` | Venue → Territory | — | static |
| `CO_PROGRAMMES_WITH` | Venue ↔ Venue | — | `affinity_score`, `film_overlap_count` (derived) |
| `SIMILAR_TO` | Film ↔ Film | — | `combined_similarity` (derived) |
| `FESTIVAL_PIPELINE` | Festival → Territory | — | `pickup_rate`, `avg_months_to_theatrical` (derived) |

## Reserved edges (proprietary layer)

These edge types are defined in the FilmGraph schema but require the Assemble
proprietary showtimes layer to populate. They are **not available in the public
seed graph** and the public ingest engine will refuse to load them.

| Edge | Source → Target | Requires |
| --- | --- | --- |
| `EXHIBITED_AT` | Film → Venue | Assemble showtimes data |
| `SHAPE_MATCHES` | Film ↔ Film | Assemble showtimes data |
