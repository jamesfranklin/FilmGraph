"""Load festivals into Neo4j.

Always loads Festival nodes from the committed ``festival_list.csv``. With
``--edges`` it also loads SCREENED_AT edges from scraper output under
``seed/festivals/output/*.jsonl`` (generated locally, not committed). Raw edge
records without a ``film_tmdb_id`` cannot be matched to a Film node and are
skipped (counted), pending manual matching via the converter layer.

Usage::

    python -m filmgraph.engine.ingest.load_festivals
    python -m filmgraph.engine.ingest.load_festivals --edges
"""

from __future__ import annotations

import argparse
import csv
import json
import logging
import sys
from pathlib import Path

from filmgraph import config
from filmgraph.engine.ingest.checkpoint import Checkpoint
from filmgraph.engine.ingest.ids import festival_node_id, film_id
from filmgraph.engine.ingest.neo4j_client import Neo4jClient
from filmgraph.engine.validate.validate_edge import validate_edge
from filmgraph.engine.validate.validate_node import validate_node

logger = logging.getLogger("load_festivals")

FESTIVAL_LIST = config.SEED_DIR / "festivals" / "festival_list.csv"
OUTPUT_DIR = config.SEED_DIR / "festivals" / "output"

EDGE_PROP_KEYS = ("year", "section", "premiere_status", "award_won")


def _festival_record(row: dict) -> tuple[str, dict]:
    slug = row["festival_id"].strip()
    record: dict = {
        "id": festival_node_id(slug),
        "name": row["name"].strip(),
        "city": row["city"].strip(),
        "country": row["country"].strip().upper(),
        "tier": row["tier"].strip(),
        "festival_type": row["festival_type"].strip(),
    }
    if row.get("website"):
        record["website"] = row["website"].strip()
    if row.get("founded_year"):
        record["founded_year"] = int(row["founded_year"])
    return slug, record


def load_nodes(client: Neo4jClient, checkpoint: Checkpoint) -> tuple[int, int, int]:
    loaded = skipped = invalid = 0
    with FESTIVAL_LIST.open(newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            slug, record = _festival_record(row)
            errors = validate_node(record, "Festival")
            if errors:
                invalid += 1
                logger.error("festival %s invalid: %s", slug, "; ".join(errors))
                continue
            if checkpoint.is_done(record["id"]):
                skipped += 1
                continue
            client.merge_node("Festival", "id", record["id"], record)
            checkpoint.mark_done(record["id"])
            loaded += 1
    return loaded, skipped, invalid


def load_edges(client: Neo4jClient) -> tuple[int, int, int]:
    loaded = unmatched = invalid = 0
    if not OUTPUT_DIR.exists():
        logger.info("No scraper output at %s — skipping edges.", OUTPUT_DIR)
        return 0, 0, 0

    for path in sorted(OUTPUT_DIR.glob("*.jsonl")):
        for line in path.read_text().splitlines():
            line = line.strip()
            if not line:
                continue
            raw = json.loads(line)
            tmdb = raw.get("film_tmdb_id")
            if not tmdb:
                unmatched += 1
                continue
            source_id = film_id(int(tmdb))
            target_id = festival_node_id(raw["festival_id"])
            properties = {k: raw[k] for k in EDGE_PROP_KEYS if raw.get(k) is not None}
            edge = {
                "edge_type": "SCREENED_AT",
                "source_id": source_id,
                "target_id": target_id,
                "properties": properties,
            }
            errors = validate_edge(edge)
            if errors:
                invalid += 1
                logger.error("SCREENED_AT invalid (%s): %s", path.name, "; ".join(errors))
                continue
            client.merge_edge(
                "SCREENED_AT", "Film", "id", source_id, "Festival", "id", target_id, properties
            )
            loaded += 1
    return loaded, unmatched, invalid


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
    parser = argparse.ArgumentParser(description="Load festivals into Neo4j.")
    parser.add_argument("--edges", action="store_true", help="Also load SCREENED_AT edges from scraper output")
    parser.add_argument("--reset", action="store_true")
    args = parser.parse_args(argv)

    checkpoint = Checkpoint("load_festivals")
    if args.reset:
        checkpoint.reset()
        checkpoint = Checkpoint("load_festivals")

    with Neo4jClient() as client:
        client.verify_connectivity()
        client.ensure_schema()
        loaded, skipped, invalid = load_nodes(client, checkpoint)
        edge_loaded = unmatched = edge_invalid = 0
        if args.edges:
            edge_loaded, unmatched, edge_invalid = load_edges(client)

    print(
        f"load_festivals complete: nodes_loaded={loaded} skipped={skipped} invalid={invalid}"
        + (
            f" | edges_loaded={edge_loaded} unmatched(no tmdb)={unmatched} edges_invalid={edge_invalid}"
            if args.edges
            else ""
        )
    )
    return 1 if invalid or edge_invalid else 0


if __name__ == "__main__":
    sys.exit(main())
