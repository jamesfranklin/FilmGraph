# Box office seed (The Numbers)

A tool for instance operators to attach public box office figures to Film nodes.

## What is and isn't committed

| File | Committed? | Notes |
| --- | --- | --- |
| `titles.csv` | **yes** | Input list: `the_numbers_slug`, `title`, `year`, `tmdb_id`. The slug must match the movie's URL path on the-numbers.com — verify each one. |
| `the_numbers.py` | **yes** | The scraper tool. |
| `output/box_office.jsonl` | **no** | Generated locally. Gitignored. |

## Schema gap (read this)

FilmGraph **v1 does not define a box-office node or edge type**. The loader
attaches figures to Film nodes as supplementary properties (`total_gross`,
`opening_weekend`, `box_office_currency`, `box_office_territory`). These are
**outside the validated v1 Film schema**. Formalise a box-office schema element
before depending on this in production.

## Running it

```bash
python seed/box_office/the_numbers.py --titles seed/box_office/titles.csv
python -m filmgraph.engine.ingest.load_box_office
```

The scraper's selectors are best-effort and may need updating when the-numbers.com
changes its markup. Films are matched by `tmdb_id` where present, otherwise by
`title` + `year`.
