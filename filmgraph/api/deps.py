"""Shared API dependencies: repository selection and pagination params."""

from __future__ import annotations

from functools import lru_cache

from fastapi import Query

from filmgraph import config
from filmgraph.api.models import DEFAULT_LIMIT, MAX_LIMIT
from filmgraph.api.repo import InMemoryRepo, Neo4jRepo, Repo


@lru_cache(maxsize=1)
def _default_repo() -> Repo:
    """Pick a backend: Neo4j when configured, otherwise the seed-backed
    in-memory repo (so the API works out of the box and in tests)."""
    if config.NEO4J_PASSWORD:
        return Neo4jRepo()
    return InMemoryRepo()


def get_repo() -> Repo:
    return _default_repo()


class Pagination:
    def __init__(
        self,
        page: int = Query(1, ge=1),
        limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    ):
        self.page = page
        self.limit = limit
