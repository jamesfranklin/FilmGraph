"""Derive FESTIVAL_PIPELINE edges (Festival -> Territory).

For each Festival, looks at the films it selected (SCREENED_AT) and, per
territory, computes:

- ``pickup_rate`` — fraction of screened films that were later distributed in
  that territory (DISTRIBUTED_BY).
- ``avg_months_to_theatrical`` — average months from the festival edition to the
  territory release date.

Confidence threshold: a festival must have at least ``--min-films`` screened
films (default 5) before any pipeline edge is written.

Idempotent (MERGE) and resumable (a per-festival checkpoint lets a re-run skip
festivals already processed; ``--reset`` recomputes everything).

APPROXIMATION: SCREENED_AT carries only a year, not an exact edition date, so the
festival edition is approximated as 1 January of that year. Treat
``avg_months_to_theatrical`` as approximate.

The public seed graph has no committed SCREENED_AT edges, so this typically
produces edges only once a local instance has loaded festival programme data.

Usage::

    python -m filmgraph.engine.enrich.festival_pipeline --min-films 5
"""

from __future__ import annotations

import argparse
import logging
import sys

from filmgraph.engine.ingest.checkpoint import Checkpoint
from filmgraph.engine.ingest.neo4j_client import Neo4jClient

logger = logging.getLogger("festival_pipeline")

PIPELINE_QUERY = """
MATCH (fest:Festival {id: $fid})<-[s:SCREENED_AT]-(film:Film)
WITH fest, count(DISTINCT film) AS total_films
WHERE total_films >= $min_films
MATCH (fest)<-[s:SCREENED_AT]-(film:Film)-[d:DISTRIBUTED_BY]->(:Distributor)
WHERE d.territory IS NOT NULL AND d.release_date IS NOT NULL
WITH fest, total_films, d.territory AS terr,
     count(DISTINCT film) AS picked,
     avg(duration.between(date(toString(s.year) + '-01-01'), date(d.release_date)).months) AS avg_months
MERGE (t:Territory {iso_code: terr})
  ON CREATE SET t.name = terr
MERGE (fest)-[r:FESTIVAL_PIPELINE]->(t)
SET r.pickup_rate = toFloat(picked) / total_films,
    r.avg_months_to_theatrical = avg_months
RETURN count(r) AS edges
"""


def run(min_films: int = 5, reset: bool = False) -> int:
    checkpoint = Checkpoint("festival_pipeline")
    if reset:
        checkpoint.reset()
        checkpoint = Checkpoint("festival_pipeline")

    processed = edges = 0
    with Neo4jClient() as client:
        client.verify_connectivity()
        with client.session() as session:
            festival_ids = [r["id"] for r in session.run("MATCH (f:Festival) RETURN f.id AS id")]
            for fid in festival_ids:
                if checkpoint.is_done(fid):
                    continue
                result = session.run(PIPELINE_QUERY, fid=fid, min_films=min_films).single()
                edges += int(result["edges"]) if result else 0
                checkpoint.mark_done(fid)
                processed += 1

    print(f"festival_pipeline complete: festivals_processed={processed} edges_written={edges}")
    return 0


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
    parser = argparse.ArgumentParser(description="Derive FESTIVAL_PIPELINE edges.")
    parser.add_argument("--min-films", type=int, default=5)
    parser.add_argument("--reset", action="store_true")
    args = parser.parse_args(argv)
    return run(min_films=args.min_films, reset=args.reset)


if __name__ == "__main__":
    sys.exit(main())
