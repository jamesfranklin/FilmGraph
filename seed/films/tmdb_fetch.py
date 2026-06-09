"""Fetch Film node metadata from TMDB for the IDs in film_ids.csv.

Run locally by instance operators. Requires a TMDB API key in the environment
(``TMDB_API_KEY``). The output ``films.jsonl`` is NOT committed — see
``seed/films/README.md`` for TMDB terms.

Usage::

    export TMDB_API_KEY=your_tmdb_api_key_here
    python seed/films/tmdb_fetch.py --ids seed/films/film_ids.csv --output seed/films/films.jsonl
"""

from __future__ import annotations

import argparse
import collections
import csv
import json
import logging
import sys
import time
from pathlib import Path

# Repo root is on sys.path when run as `python seed/films/tmdb_fetch.py`.
from filmgraph import config
from filmgraph.engine.ingest.checkpoint import Checkpoint
from filmgraph.engine.ingest.ids import film_id
from filmgraph.engine.validate.validate_node import validate_node
from filmgraph.models.tmdb.client import TMDBClient

logger = logging.getLogger("tmdb_fetch")

RATE_LIMIT = 40
RATE_WINDOW = 10.0  # seconds


def budget_tier(budget: int) -> str | None:
    if not budget or budget <= 0:
        return None
    if budget < 5_000_000:
        return "low"
    if budget < 30_000_000:
        return "mid"
    return "high"


def to_film_node(movie: dict) -> dict:
    tmdb_id = int(movie["id"])
    record: dict = {
        "id": film_id(tmdb_id),
        "tmdb_id": tmdb_id,
        "title": movie.get("title") or movie.get("original_title") or "",
    }
    release_date = movie.get("release_date") or ""
    if len(release_date) >= 4 and release_date[:4].isdigit():
        record["year"] = int(release_date[:4])

    if movie.get("imdb_id"):
        record["imdb_id"] = movie["imdb_id"]

    countries = [c["iso_3166_1"].upper() for c in movie.get("production_countries", []) if c.get("iso_3166_1")]
    if countries:
        record["origin_country"] = countries
    if movie.get("original_language"):
        record["language"] = movie["original_language"]

    genres = [g["name"] for g in movie.get("genres", []) if g.get("name")]
    if genres:
        record["genres"] = genres

    tier = budget_tier(movie.get("budget", 0))
    if tier:
        record["budget_tier"] = tier
    if movie.get("runtime"):
        record["runtime_mins"] = int(movie["runtime"])
    if movie.get("vote_average") is not None:
        record["vote_average"] = float(movie["vote_average"])
    if movie.get("vote_count") is not None:
        record["vote_count"] = int(movie["vote_count"])

    keywords = [k["name"] for k in movie.get("keywords", {}).get("keywords", []) if k.get("name")]
    if keywords:
        record["keywords"] = keywords

    return record


class RateLimiter:
    def __init__(self, limit: int = RATE_LIMIT, window: float = RATE_WINDOW):
        self.limit = limit
        self.window = window
        self._times: collections.deque[float] = collections.deque()

    def wait(self) -> None:
        now = time.monotonic()
        while self._times and now - self._times[0] >= self.window:
            self._times.popleft()
        if len(self._times) >= self.limit:
            sleep_for = self.window - (now - self._times[0])
            if sleep_for > 0:
                time.sleep(sleep_for)
        self._times.append(time.monotonic())


def read_ids(ids_path: Path, tier: str = "all") -> list[int]:
    """Read TMDB ids from the seed CSV, optionally filtered by corpus tier.

    The CSV header is ``tmdb_id,title_hint,tier``. The ``tier`` column is
    optional per row; a blank or missing tier is treated as ``core`` so older
    two-column files keep working. ``tier="all"`` (the default) returns every
    row regardless of tier.
    """
    wanted = tier.strip().lower()
    ids: list[int] = []
    with ids_path.open(newline="", encoding="utf-8") as fh:
        reader = csv.reader(fh)
        tier_idx: int | None = None
        for row in reader:
            if not row:
                continue
            value = row[0].strip()
            if not value or value.startswith("#"):
                continue
            if value.lower() == "tmdb_id":  # header row
                header = [c.strip().lower() for c in row]
                tier_idx = header.index("tier") if "tier" in header else None
                continue
            row_tier = "core"
            if tier_idx is not None and len(row) > tier_idx:
                row_tier = row[tier_idx].strip().lower() or "core"
            if wanted != "all" and row_tier != wanted:
                continue
            ids.append(int(value))
    return ids


def _cache_path(tmdb_id: int) -> Path:
    return Path(config.TMDB_CACHE_PATH) / f"{tmdb_id}.json"


def fetch_all(ids_path: Path, output_path: Path, reset: bool = False, tier: str = "all") -> int:
    checkpoint = Checkpoint("tmdb_fetch")
    if reset:
        checkpoint.reset()
        checkpoint = Checkpoint("tmdb_fetch")

    cache_dir = Path(config.TMDB_CACHE_PATH)
    cache_dir.mkdir(parents=True, exist_ok=True)

    client: TMDBClient | None = None
    limiter = RateLimiter()
    records: list[dict] = []
    fetched = cached = failed = invalid = 0

    for tmdb_id in read_ids(ids_path, tier=tier):
        cache_file = _cache_path(tmdb_id)
        try:
            if cache_file.exists():
                movie = json.loads(cache_file.read_text())
                cached += 1
            else:
                if client is None:
                    client = TMDBClient()  # raises if TMDB_API_KEY unset
                limiter.wait()
                movie = client.get_movie(tmdb_id)
                cache_file.write_text(json.dumps(movie))
                fetched += 1
        except Exception as exc:  # noqa: BLE001 - never abort the batch
            failed += 1
            logger.error("Failed to fetch TMDB %s: %s", tmdb_id, exc)
            continue

        record = to_film_node(movie)
        errors = validate_node(record, "Film")
        if errors:
            invalid += 1
            logger.error("TMDB %s produced invalid Film: %s", tmdb_id, "; ".join(errors))
            continue
        records.append(record)
        checkpoint.mark_done(str(tmdb_id))

    with output_path.open("w", encoding="utf-8") as fh:
        for record in records:
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")

    print(
        f"tmdb_fetch complete: wrote={len(records)} fetched={fetched} cached={cached} "
        f"failed={failed} invalid={invalid} -> {output_path}"
    )
    return 1 if failed or invalid else 0


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
    parser = argparse.ArgumentParser(description="Fetch Film nodes from TMDB.")
    parser.add_argument("--ids", default="seed/films/film_ids.csv")
    parser.add_argument("--output", default="seed/films/films.jsonl")
    parser.add_argument("--reset", action="store_true")
    parser.add_argument(
        "--tier",
        choices=["core", "extended", "all"],
        default="all",
        help="Fetch only films in this corpus tier (default: all).",
    )
    args = parser.parse_args(argv)
    return fetch_all(Path(args.ids), Path(args.output), reset=args.reset, tier=args.tier)


if __name__ == "__main__":
    sys.exit(main())
