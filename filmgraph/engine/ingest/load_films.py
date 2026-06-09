"""Load locally generated Film records into Neo4j.

``films.jsonl`` is produced by ``seed/films/tmdb_fetch.py`` and is NOT committed
to the repository (TMDB terms). Generate it first, then run this loader.

Usage::

    python -m filmgraph.engine.ingest.load_films --file seed/films/films.jsonl
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from filmgraph import config
from filmgraph.engine.ingest.node_loader import load_node_seed

DEFAULT_SOURCE = config.SEED_DIR / "films" / "films.jsonl"


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
    parser = argparse.ArgumentParser(description="Load films into Neo4j.")
    parser.add_argument("--file", default=str(DEFAULT_SOURCE))
    parser.add_argument("--reset", action="store_true")
    args = parser.parse_args(argv)

    source = Path(args.file)
    if not source.exists():
        print(
            f"{source} not found. Generate it first with seed/films/tmdb_fetch.py "
            "(requires TMDB_API_KEY).",
            file=sys.stderr,
        )
        return 2

    return load_node_seed(
        label="Film",
        node_type="Film",
        source=source,
        job_name="load_films",
        reset=args.reset,
    )


if __name__ == "__main__":
    sys.exit(main())
