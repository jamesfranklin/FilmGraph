"""FilmGraph public API.

Read-only. Rate limited (60 req/min anonymous, 600 req/min with a valid API key).
No write endpoints. Every data response is wrapped in an envelope carrying the
schema version.
"""

from __future__ import annotations

import json
from functools import lru_cache

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from starlette.requests import Request

from filmgraph import config
from filmgraph.api.auth import RateLimiter
from filmgraph.api.models import envelope
from filmgraph.api.routers import (
    awards,
    distributors,
    festivals,
    films,
    organisations,
    practitioners,
    territories,
    venues,
)
from filmgraph.sync import webhook

app = FastAPI(
    title="FilmGraph API",
    version=config.SCHEMA_VERSION,
    description="Open, read-only graph API for the independent film ecosystem.",
)

_rate_limiter = RateLimiter()


@app.middleware("http")
async def rate_limit(request: Request, call_next):
    allowed, limit = _rate_limiter.check_request(request)
    if not allowed:
        return JSONResponse(
            status_code=429,
            content={
                "schema_version": config.SCHEMA_VERSION,
                "error": "rate_limit_exceeded",
                "limit_per_minute": limit,
            },
            headers={"Retry-After": "60"},
        )
    return await call_next(request)


@lru_cache(maxsize=1)
def _full_schema() -> dict:
    """filmgraph.json with node_types and edge_types inlined (self-contained)."""
    base = json.loads((config.SCHEMA_VERSION_DIR / "filmgraph.json").read_text())
    base["node_types"] = json.loads((config.SCHEMA_VERSION_DIR / "nodes.json").read_text())
    base["edge_types"] = json.loads((config.SCHEMA_VERSION_DIR / "edges.json").read_text())
    return base


@app.get("/", tags=["meta"])
def root():
    return envelope({"status": "ok", "service": "FilmGraph API"})


@app.get("/schema", tags=["meta"])
def get_schema():
    return _full_schema()


@app.get("/schema/version", tags=["meta"])
def get_schema_version():
    return envelope(config.SCHEMA_VERSION)


for module in (films, venues, festivals, distributors, awards, practitioners, organisations, territories):
    app.include_router(module.router)

app.include_router(webhook.router)
