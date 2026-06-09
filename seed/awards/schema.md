# Awards seed

Two static, manually curated, committed files seed the awards layer.

## `award_bodies.jsonl` — AwardBody nodes

| Field | Required | Notes |
| --- | --- | --- |
| `id` | yes | UUID (deterministic, derived from `short_name` + `country`) |
| `name` | yes | Full body name, e.g. "Academy of Motion Picture Arts and Sciences" |
| `short_name` | yes | Common awards name, e.g. "Academy Awards" |
| `country` | yes | ISO 3166-1 alpha-2 |
| `founded_year` | no | |
| `website` | no | |

## `award_categories.jsonl` — AwardCategory nodes

| Field | Required | Notes |
| --- | --- | --- |
| `id` | yes | UUID (deterministic, derived from `award_body_id` + `name`) |
| `award_body_id` | yes | References an AwardBody `id` |
| `name` | yes | e.g. "Best Documentary Feature" |
| `discipline` | no | `directing` / `acting` / `writing` / `craft` / `production` / `documentary` / `international` / `other` |

v1 includes the major film categories only (Best Film/Picture, Best Director,
lead/supporting acting, Best Documentary, Best International, Best Animated, plus
each body's headline equivalents). Films connect to categories via the
`NOMINATED_FOR` and `WON` edges.

Validate:

```bash
python -m filmgraph.engine.validate.validate_file --file seed/awards/award_bodies.jsonl --type AwardBody
python -m filmgraph.engine.validate.validate_file --file seed/awards/award_categories.jsonl --type AwardCategory
```
