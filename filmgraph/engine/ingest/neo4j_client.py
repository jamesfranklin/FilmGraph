"""Neo4j connection and schema management for FilmGraph ingest.

Credentials are read from environment variables only (NEO4J_URI, NEO4J_USER,
NEO4J_PASSWORD) via :mod:`filmgraph.config`. On first connect, call
``ensure_schema()`` to create uniqueness constraints and indexes.

All writes use MERGE (never CREATE) so ingest is idempotent.
"""

from __future__ import annotations

import logging

from neo4j import GraphDatabase

from filmgraph import config

logger = logging.getLogger(__name__)

# Node labels keyed by `id` (UUID). Territory is keyed by iso_code instead.
ID_KEYED_LABELS = [
    "Film",
    "Venue",
    "Festival",
    "Market",
    "AwardBody",
    "AwardCategory",
    "Distributor",
    "Practitioner",
    "Organisation",
    "Platform",
]

# (label, [properties]) index definitions.
INDEXES = [
    ("Film", ["tmdb_id"]),
    ("Film", ["title"]),
    ("Film", ["year"]),
    ("Venue", ["city"]),
    ("Venue", ["country"]),
    ("Festival", ["name"]),
    ("Festival", ["country"]),
    ("Distributor", ["name"]),
    ("Practitioner", ["name"]),
    ("Practitioner", ["role"]),
    ("AwardBody", ["short_name"]),
]


class Neo4jClient:
    def __init__(self, uri: str | None = None, user: str | None = None, password: str | None = None):
        uri = uri or config.NEO4J_URI
        user = user or config.NEO4J_USER
        password = password or config.NEO4J_PASSWORD
        if not password:
            raise RuntimeError(
                "NEO4J_PASSWORD is not set. Configure credentials via environment "
                "variables (see .env.example)."
            )
        self._driver = GraphDatabase.driver(uri, auth=(user, password))

    def __enter__(self) -> "Neo4jClient":
        return self

    def __exit__(self, *exc) -> None:
        self.close()

    def close(self) -> None:
        self._driver.close()

    def verify_connectivity(self) -> None:
        self._driver.verify_connectivity()

    def session(self):
        return self._driver.session()

    # --- Schema ------------------------------------------------------------

    def ensure_schema(self) -> None:
        """Create all constraints and indexes. Safe to call repeatedly."""
        statements: list[str] = []

        # Uniqueness constraints on `id`.
        for label in ID_KEYED_LABELS:
            statements.append(
                f"CREATE CONSTRAINT {label.lower()}_id_unique IF NOT EXISTS "
                f"FOR (n:{label}) REQUIRE n.id IS UNIQUE"
            )

        # Film.tmdb_id unique.
        statements.append(
            "CREATE CONSTRAINT film_tmdb_id_unique IF NOT EXISTS "
            "FOR (n:Film) REQUIRE n.tmdb_id IS UNIQUE"
        )

        # Territory.iso_code unique (primary key).
        statements.append(
            "CREATE CONSTRAINT territory_iso_code_unique IF NOT EXISTS "
            "FOR (n:Territory) REQUIRE n.iso_code IS UNIQUE"
        )

        with self.session() as session:
            for stmt in statements:
                self._run_safe(session, stmt)

            # AwardBody (short_name, country) composite uniqueness. Composite
            # uniqueness is an Enterprise feature; on Community it raises, so we
            # fall back to a composite index to preserve lookup performance.
            composite = (
                "CREATE CONSTRAINT awardbody_shortname_country_unique IF NOT EXISTS "
                "FOR (n:AwardBody) REQUIRE (n.short_name, n.country) IS UNIQUE"
            )
            if not self._run_safe(session, composite):
                self._run_safe(
                    session,
                    "CREATE INDEX awardbody_shortname_country IF NOT EXISTS "
                    "FOR (n:AwardBody) ON (n.short_name, n.country)",
                )

            for label, props in INDEXES:
                prop_list = ", ".join(f"n.{p}" for p in props)
                name = f"{label.lower()}_{'_'.join(props)}_idx"
                self._run_safe(
                    session,
                    f"CREATE INDEX {name} IF NOT EXISTS FOR (n:{label}) ON ({prop_list})",
                )

    @staticmethod
    def _run_safe(session, statement: str) -> bool:
        """Run a schema statement, logging and swallowing feature errors."""
        try:
            session.run(statement).consume()
            return True
        except Exception as exc:  # noqa: BLE001 - schema setup must not abort.
            logger.warning("Schema statement skipped: %s (%s)", statement, exc)
            return False

    # --- Writes ------------------------------------------------------------

    def merge_node(self, label: str, key: str, value, props: dict) -> None:
        """MERGE a node on `key`=value and set the remaining properties."""
        body = {k: v for k, v in props.items() if k != key and not k.startswith("_")}
        with self.session() as session:
            session.run(
                f"MERGE (n:{label} {{{key}: $value}}) SET n += $props",
                value=value,
                props=body,
            ).consume()

    def merge_edge(
        self,
        edge_type: str,
        source_label: str,
        source_key: str,
        source_value,
        target_label: str,
        target_key: str,
        target_value,
        properties: dict | None = None,
    ) -> None:
        """MERGE an edge keyed on source + target + type + year (if present)."""
        properties = properties or {}
        merge_props = {}
        if "year" in properties:
            merge_props["year"] = properties["year"]
        merge_clause = (
            f"{{{', '.join(f'{k}: ${k}_m' for k in merge_props)}}}" if merge_props else ""
        )
        params = {
            "source_value": source_value,
            "target_value": target_value,
            "props": properties,
        }
        params.update({f"{k}_m": v for k, v in merge_props.items()})
        with self.session() as session:
            session.run(
                f"MATCH (s:{source_label} {{{source_key}: $source_value}}) "
                f"MATCH (t:{target_label} {{{target_key}: $target_value}}) "
                f"MERGE (s)-[r:{edge_type} {merge_clause}]->(t) "
                f"SET r += $props",
                **params,
            ).consume()
