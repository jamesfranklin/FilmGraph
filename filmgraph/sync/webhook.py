"""Inbound sync endpoints.

- ``POST /sync/register`` — register a webhook endpoint (API key required).
- ``GET  /sync/{token}``  — fetch delta data for a sync event.
- ``POST /sync/notify``   — internal; GitHub Action only, protected by
  ``FILMGRAPH_SYNC_KEY``. Fans the payload out to registered instances.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from filmgraph import config
from filmgraph.sync import registry

logger = logging.getLogger("sync")

router = APIRouter(prefix="/sync", tags=["sync"])

# Committed public seed sources an instance can pull.
SEED_SOURCES = [
    "schema/v1/filmgraph.json",
    "seed/venues/venues.jsonl",
    "seed/funders/funders.jsonl",
    "seed/awards/award_bodies.jsonl",
    "seed/awards/award_categories.jsonl",
    "seed/distributors/distributors.jsonl",
    "seed/practitioners/practitioners.jsonl",
    "seed/festivals/festival_list.csv",
]


class RegisterRequest(BaseModel):
    url: str


class NotifyPayload(BaseModel):
    schema_version: str
    previous_version: str | None = None
    requires_migration: bool = False
    changed_sources: list[str] = []
    sync_url: str | None = None
    timestamp: str | None = None


def _require_api_key(x_api_key: str | None) -> None:
    if not config.FILMGRAPH_API_KEY or x_api_key != config.FILMGRAPH_API_KEY:
        raise HTTPException(status_code=401, detail="Valid API key required")


def _require_sync_key(x_sync_key: str | None) -> None:
    if not config.FILMGRAPH_SYNC_KEY or x_sync_key != config.FILMGRAPH_SYNC_KEY:
        raise HTTPException(status_code=403, detail="Valid sync key required")


@router.post("/register")
def register_endpoint(body: RegisterRequest, x_api_key: str | None = Header(default=None)):
    _require_api_key(x_api_key)
    token = registry.register(body.url)
    return {"schema_version": config.SCHEMA_VERSION, "data": {"token": token}}


@router.get("/{token}")
def fetch_delta(token: str):
    if registry.get(token) is None:
        raise HTTPException(status_code=404, detail="Unknown sync token")
    return {
        "schema_version": config.SCHEMA_VERSION,
        "data": {"sources": SEED_SOURCES},
    }


@router.post("/notify")
def notify(payload: NotifyPayload, x_sync_key: str | None = Header(default=None)):
    _require_sync_key(x_sync_key)

    import requests

    delivered = 0
    failed = 0
    for entry in registry.endpoints():
        try:
            response = requests.post(entry["url"], json=payload.model_dump(), timeout=15)
            if response.ok:
                delivered += 1
            else:
                failed += 1
        except Exception as exc:  # noqa: BLE001 - one bad endpoint must not abort fan-out
            failed += 1
            logger.error("sync fan-out to %s failed: %s", entry.get("url"), exc)

    return {
        "schema_version": config.SCHEMA_VERSION,
        "data": {"delivered": delivered, "failed": failed},
    }
