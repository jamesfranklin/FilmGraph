"""API response envelopes.

Every response is wrapped in an envelope carrying the schema version, per the
brief::

    { "schema_version": "1.0.0", "data": { ... } }

List responses additionally carry pagination metadata.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel

from filmgraph import config

MAX_LIMIT = 100
DEFAULT_LIMIT = 20


class Envelope(BaseModel):
    schema_version: str = config.SCHEMA_VERSION
    data: Any


class Page(BaseModel):
    page: int
    limit: int
    count: int
    items: list[dict]


def envelope(data: Any) -> dict:
    return {"schema_version": config.SCHEMA_VERSION, "data": data}


def paginate(items: list[dict], page: int, limit: int) -> dict:
    limit = max(1, min(limit, MAX_LIMIT))
    page = max(1, page)
    start = (page - 1) * limit
    window = items[start : start + limit]
    return {
        "schema_version": config.SCHEMA_VERSION,
        "data": {
            "page": page,
            "limit": limit,
            "count": len(items),
            "items": window,
        },
    }
