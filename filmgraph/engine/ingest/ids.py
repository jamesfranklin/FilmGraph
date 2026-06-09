"""Deterministic node-id helpers.

Some nodes are keyed by an external identifier rather than a committed UUID:
Film nodes by TMDB id, Festival nodes by a festival slug (the ``festival_id``
used by scrapers and ``festival_list.csv``). Computing their UUIDs the same way
everywhere keeps ingest idempotent and lets edges resolve to the right nodes.
"""

from __future__ import annotations

import uuid

FILM_NAMESPACE = uuid.UUID("f0a1b2c3-4d5e-5f60-9a8b-7c6d5e4f3a21")
FESTIVAL_NAMESPACE = uuid.UUID("a1b2c3d4-5e6f-5071-8293-a4b5c6d7e8f9")


def film_id(tmdb_id: int) -> str:
    return str(uuid.uuid5(FILM_NAMESPACE, f"tmdb:{tmdb_id}"))


def festival_node_id(slug: str) -> str:
    return str(uuid.uuid5(FESTIVAL_NAMESPACE, f"festival:{slug.strip().lower()}"))
