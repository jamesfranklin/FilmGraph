"""Load the committed venue seed into Neo4j.

Idempotent and resumable. Usage::

    python -m filmgraph.engine.ingest.load_venues
    python -m filmgraph.engine.ingest.load_venues --reset   # ignore checkpoint
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from filmgraph import config
from filmgraph.engine.ingest.node_loader import load_node_seed

DEFAULT_SOURCE = config.SEED_DIR / "venues" / "venues.jsonl"


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
    parser = argparse.ArgumentParser(description="Load venues into Neo4j.")
    parser.add_argument("--file", default=str(DEFAULT_SOURCE))
    parser.add_argument("--reset", action="store_true", help="Ignore the checkpoint and reload all")
    args = parser.parse_args(argv)

    return load_node_seed(
        label="Venue",
        node_type="Venue",
        source=Path(args.file),
        job_name="load_venues",
        reset=args.reset,
    )


if __name__ == "__main__":
    sys.exit(main())
