# Films seed (TMDB)

This directory provides a tool for instance operators to populate Film nodes from
[TMDB](https://www.themoviedb.org/). **It is not a redistribution of TMDB data.**

## What is and isn't committed

| File | Committed? | Notes |
| --- | --- | --- |
| `film_ids.csv` | **yes** | A seed list of TMDB IDs. IDs are not TMDB content. |

The committed corpus is a curated set of festival-circuit films (narrative and
documentary) spanning multiple years and territories. Each row carries a `tier`:

- **`core`** — a small set (the original six plus two documentaries) suited to
  quick demos and local smoke checks.
- **`extended`** — the larger curated showcase, exercising awards, festivals,
  distributors, and reviews across the schema.
| `tmdb_fetch.py` | **yes** | The fetch tool. |
| `films.jsonl` | **no** | Generated locally by the tool. Gitignored. Never committed. |

## TMDB terms — read before running

- You must supply your **own** TMDB API key via the `TMDB_API_KEY` environment
  variable. The tool reads it from the environment only.
- You must comply with the [TMDB terms of service](https://www.themoviedb.org/terms-of-use).
  **Bulk redistribution of TMDB data is not permitted.** Each operator is
  responsible for their own API usage.
- This product uses the TMDB API but is not endorsed or certified by TMDB.

## Running it

```bash
export TMDB_API_KEY=your_tmdb_api_key_here
python seed/films/tmdb_fetch.py --ids seed/films/film_ids.csv --output seed/films/films.jsonl

# Or fetch just the small core tier:
python seed/films/tmdb_fetch.py --tier core --output seed/films/films.jsonl
```

The tool:

- Reads TMDB IDs from `film_ids.csv` (first column; the `title_hint` column is
  for human verification only, and the `tier` column selects the corpus tier).
  Pass `--tier core` or `--tier extended` to fetch only that tier; the default
  `--tier all` fetches every film.
- Caches each raw response to `cache/tmdb/{id}.json` (gitignored).
- Is resumable via a checkpoint — re-running skips IDs already fetched.
- Rate limits to 40 requests / 10 seconds.
- Logs failures and continues rather than aborting.
- Writes Film node records to `films.jsonl`.

Then load into Neo4j:

```bash
python -m filmgraph.engine.ingest.load_films --file seed/films/films.jsonl
```
