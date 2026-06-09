"""Attach box office figures to Film nodes.

Reads locally generated ``seed/box_office/output/box_office.jsonl`` (produced by
``seed/box_office/the_numbers.py``; not committed) and sets supplementary
properties on matching Film nodes. Films are matched by ``film_tmdb_id`` where
present, otherwise by ``title`` + ``film_year``.

SCHEMA NOTE: v1 has no box-office node or edge type, so these properties
(``total_gross``, ``opening_weekend``, ``box_office_currency``,
``box_office_territory``) are NOT part of the validated Film node schema. This is
a known gap to formalise in a future schema version.

Usage::

    python -m filmgraph.engine.ingest.load_box_office
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

from filmgraph import config
from filmgraph.engine.ingest.ids import film_id
from filmgraph.engine.ingest.neo4j_client import Neo4jClient

logger = logging.getLogger("load_box_office")

DEFAULT_SOURCE = config.SEED_DIR / "box_office" / "output" / "box_office.jsonl"


def _box_office_props(raw: dict) -> dict:
    props: dict = {}
    if raw.get("total_gross") is not None:
        props["total_gross"] = int(raw["total_gross"])
    if raw.get("opening_weekend") is not None:
        props["opening_weekend"] = int(raw["opening_weekend"])
    if raw.get("currency"):
        props["box_office_currency"] = raw["currency"]
    if raw.get("territory"):
        props["box_office_territory"] = raw["territory"]
    return props


def load(source: Path) -> int:
    if not source.exists():
        print(
            f"{source} not found. Generate it first with seed/box_office/the_numbers.py.",
            file=sys.stderr,
        )
        return 2

    matched = unmatched = 0
    with Neo4jClient() as client, client.session() as session:
        for line in source.read_text().splitlines():
            line = line.strip()
            if not line:
                continue
            raw = json.loads(line)
            props = _box_office_props(raw)
            if not props:
                continue

            tmdb = raw.get("film_tmdb_id")
            if tmdb:
                result = session.run(
                    "MATCH (f:Film {id: $id}) SET f += $props RETURN count(f) AS n",
                    id=film_id(int(tmdb)),
                    props=props,
                ).single()
            else:
                result = session.run(
                    "MATCH (f:Film {title: $title, year: $year}) SET f += $props RETURN count(f) AS n",
                    title=raw.get("film_title"),
                    year=raw.get("film_year"),
                    props=props,
                ).single()

            if result and result["n"]:
                matched += int(result["n"])
            else:
                unmatched += 1
                logger.warning("box office: no Film match for %s", raw.get("film_title"))

    print(f"load_box_office complete: matched={matched} unmatched={unmatched}")
    return 0


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
    parser = argparse.ArgumentParser(description="Attach box office figures to Film nodes.")
    parser.add_argument("--file", default=str(DEFAULT_SOURCE))
    args = parser.parse_args(argv)
    return load(Path(args.file))


if __name__ == "__main__":
    sys.exit(main())
