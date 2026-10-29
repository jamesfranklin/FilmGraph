"""FilmGraph public API.

Read-only. Rate limited (60 req/min anonymous, 600 req/min with a valid API key).
No write endpoints. Every data response is wrapped in an envelope carrying the
schema version.
"""

from __future__ import annotations

import json
from functools import lru_cache

from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.requests import Request

from filmgraph import config
from filmgraph.api.auth import RateLimiter, is_authenticated
from filmgraph.api.deps import get_repo
from filmgraph.api.models import envelope, error_envelope
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

# Always reachable without a key, even on a private node.
OPEN_PATHS = {"/", "/.well-known/filmgraph", "/schema", "/schema/version", "/docs", "/redoc", "/openapi.json"}

_STATUS_CODES = {400: "bad_request", 401: "unauthorized", 403: "forbidden", 404: "not_found", 429: "rate_limit_exceeded"}


@app.exception_handler(HTTPException)
async def http_error(request: Request, exc: HTTPException):
    code = _STATUS_CODES.get(exc.status_code, "error")
    return JSONResponse(status_code=exc.status_code, content=error_envelope(code, str(exc.detail)), headers=exc.headers)


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    return JSONResponse(status_code=400, content=error_envelope("bad_request", str(exc.errors()[0].get("msg", "invalid request"))))


@app.middleware("http")
async def auth_and_rate_limit(request: Request, call_next):
    if config.NODE_AUTH == "required" and request.url.path not in OPEN_PATHS and not is_authenticated(request):
        return JSONResponse(status_code=401, content=error_envelope("unauthorized", "Valid API key required"))
    allowed, limit = _rate_limiter.check_request(request)
    if not allowed:
        body = error_envelope("rate_limit_exceeded", f"Limit is {limit} requests per minute")
        body["limit_per_minute"] = limit
        return JSONResponse(status_code=429, content=body, headers={"Retry-After": "60"})
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


@app.get("/.well-known/filmgraph", tags=["meta"])
def node_manifest():
    """Node manifest — docs/node-contract.md#node-manifest."""
    repo = get_repo()
    node_types = ["Film", "Venue", "Festival", "Distributor", "AwardBody", "AwardCategory", "Practitioner", "Organisation", "Territory"]
    edge_types: list[str] = []  # The public reference node commits no edges.
    capabilities = ["films.search", "films.graph", "films.resolve", "venues", "festivals", "distributors", "sync"]
    data = {
        "node_id": config.NODE_ID,
        "name": config.NODE_NAME,
        "operator": {"name": config.NODE_OPERATOR_NAME, "url": config.NODE_OPERATOR_URL},
        "layer": config.NODE_LAYER,
        "auth": config.NODE_AUTH,
        "node_types": node_types,
        "edge_types": edge_types,
        "capabilities": capabilities,
        "film_count": len(repo.all_films()),
    }
    if config.NODE_MCP_URL:
        data["capabilities"].append("mcp")
        data["mcp"] = {"url": config.NODE_MCP_URL}
    return envelope(data)


@app.get("/schema", tags=["meta"])
def get_schema():
    return _full_schema()


@app.get("/schema/version", tags=["meta"])
def get_schema_version():
    return envelope(config.SCHEMA_VERSION)


for module in (films, venues, festivals, distributors, awards, practitioners, organisations, territories):
    app.include_router(module.router)

app.include_router(webhook.router)
