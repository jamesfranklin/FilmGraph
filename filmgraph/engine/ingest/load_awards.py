"""Load the committed awards seed (AwardBody + AwardCategory) into Neo4j.

Loads bodies first, then categories (which reference body ids). Usage::

    python -m filmgraph.engine.ingest.load_awards
    python -m filmgraph.engine.ingest.load_awards --reset
"""

from __future__ import annotations

import argparse
import logging
import sys

from filmgraph import config
from filmgraph.engine.ingest.node_loader import load_node_seed

BODIES_SOURCE = config.SEED_DIR / "awards" / "award_bodies.jsonl"
CATEGORIES_SOURCE = config.SEED_DIR / "awards" / "award_categories.jsonl"


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
    parser = argparse.ArgumentParser(description="Load award bodies and categories into Neo4j.")
    parser.add_argument("--reset", action="store_true")
    args = parser.parse_args(argv)

    rc_bodies = load_node_seed(
        label="AwardBody",
        node_type="AwardBody",
        source=BODIES_SOURCE,
        job_name="load_award_bodies",
        reset=args.reset,
    )
    rc_categories = load_node_seed(
        label="AwardCategory",
        node_type="AwardCategory",
        source=CATEGORIES_SOURCE,
        job_name="load_award_categories",
        reset=args.reset,
    )
    return rc_bodies or rc_categories


if __name__ == "__main__":
    sys.exit(main())
