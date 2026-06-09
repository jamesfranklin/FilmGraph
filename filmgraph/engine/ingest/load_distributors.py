"""Load the committed distributors seed into Neo4j.

Usage::

    python -m filmgraph.engine.ingest.load_distributors
    python -m filmgraph.engine.ingest.load_distributors --reset
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from filmgraph import config
from filmgraph.engine.ingest.node_loader import load_node_seed

DEFAULT_SOURCE = config.SEED_DIR / "distributors" / "distributors.jsonl"


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
    parser = argparse.ArgumentParser(description="Load distributors into Neo4j.")
    parser.add_argument("--file", default=str(DEFAULT_SOURCE))
    parser.add_argument("--reset", action="store_true")
    args = parser.parse_args(argv)

    return load_node_seed(
        label="Distributor",
        node_type="Distributor",
        source=Path(args.file),
        job_name="load_distributors",
        reset=args.reset,
    )


if __name__ == "__main__":
    sys.exit(main())
