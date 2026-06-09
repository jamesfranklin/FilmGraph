"""Load the committed practitioners seed into Neo4j.

Every seed record must carry a ``_source`` provenance field (enforced here). The
``_source`` field is stripped before the node is written to Neo4j.

Usage::

    python -m filmgraph.engine.ingest.load_practitioners
    python -m filmgraph.engine.ingest.load_practitioners --reset
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from filmgraph import config
from filmgraph.engine.ingest.node_loader import load_node_seed

DEFAULT_SOURCE = config.SEED_DIR / "practitioners" / "practitioners.jsonl"


def _require_source(record: dict) -> list[str]:
    if not record.get("_source"):
        return ["missing required _source provenance field"]
    return []


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
    parser = argparse.ArgumentParser(description="Load practitioners into Neo4j.")
    parser.add_argument("--file", default=str(DEFAULT_SOURCE))
    parser.add_argument("--reset", action="store_true")
    args = parser.parse_args(argv)

    return load_node_seed(
        label="Practitioner",
        node_type="Practitioner",
        source=Path(args.file),
        job_name="load_practitioners",
        reset=args.reset,
        record_hook=_require_source,
    )


if __name__ == "__main__":
    sys.exit(main())
