"""Derive ACQUIRED_FROM edges (Distributor -> Festival).

Where a film both screened at a festival (SCREENED_AT, with a year) and was
distributed in the same window, we infer that the distributor acquired the film
out of that festival. The inference rule: the territory release date falls within
0–18 months after the festival edition.

Idempotent: edges are MERGEd on (year, film_id, territory) so a re-run does not
duplicate them.

APPROXIMATION: SCREENED_AT carries only a year, so the festival edition is
approximated as 1 January of that year for the 18-month window check.

Usage::

    python -m filmgraph.engine.enrich.acquired_from --max-months 18
"""

from __future__ import annotations

import argparse
import logging
import sys

from filmgraph.engine.ingest.neo4j_client import Neo4jClient

logger = logging.getLogger("acquired_from")

ACQUIRED_QUERY = """
MATCH (film:Film)-[s:SCREENED_AT]->(fest:Festival)
MATCH (film)-[d:DISTRIBUTED_BY]->(dist:Distributor)
WHERE d.release_date IS NOT NULL
WITH film, fest, dist, d, s,
     duration.between(date(toString(s.year) + '-01-01'), date(d.release_date)).months AS months
WHERE months >= 0 AND months <= $max_months
MERGE (dist)-[r:ACQUIRED_FROM {year: s.year, film_id: film.id, territory: d.territory}]->(fest)
RETURN count(r) AS edges
"""


def run(max_months: int = 18) -> int:
    with Neo4jClient() as client:
        client.verify_connectivity()
        with client.session() as session:
            result = session.run(ACQUIRED_QUERY, max_months=max_months).single()
            edges = int(result["edges"]) if result else 0
    print(f"acquired_from complete: edges_written={edges}")
    return 0


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
    parser = argparse.ArgumentParser(description="Derive ACQUIRED_FROM edges.")
    parser.add_argument("--max-months", type=int, default=18)
    args = parser.parse_args(argv)
    return run(max_months=args.max_months)


if __name__ == "__main__":
    sys.exit(main())
