"""Venue endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from filmgraph.api.deps import Pagination, get_repo
from filmgraph.api.models import envelope, paginate
from filmgraph.api.repo import Repo

router = APIRouter(prefix="/venues", tags=["venues"])


@router.get("/search")
def search_venues(
    q: str = Query(..., min_length=1),
    country: str | None = Query(None, min_length=2, max_length=2),
    page: Pagination = Depends(),
    repo: Repo = Depends(get_repo),
):
    return paginate(repo.search_venues(q, country), page.page, page.limit)


@router.get("/{venue_id}")
def get_venue(venue_id: str, repo: Repo = Depends(get_repo)):
    venue = repo.get_venue(venue_id)
    if venue is None:
        raise HTTPException(status_code=404, detail=f"Venue {venue_id} not found")
    return envelope(venue)


@router.get("/{venue_id}/films")
def venue_films(venue_id: str, page: Pagination = Depends(), repo: Repo = Depends(get_repo)):
    return paginate(repo.venue_films(venue_id), page.page, page.limit)
