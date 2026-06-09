"""Festival endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from filmgraph.api.deps import Pagination, get_repo
from filmgraph.api.models import envelope, paginate
from filmgraph.api.repo import Repo

router = APIRouter(prefix="/festivals", tags=["festivals"])


@router.get("/search")
def search_festivals(q: str = Query(..., min_length=1), page: Pagination = Depends(), repo: Repo = Depends(get_repo)):
    return paginate(repo.search_festivals(q), page.page, page.limit)


@router.get("/{festival_id}")
def get_festival(festival_id: str, repo: Repo = Depends(get_repo)):
    festival = repo.get_festival(festival_id)
    if festival is None:
        raise HTTPException(status_code=404, detail=f"Festival {festival_id} not found")
    return envelope(festival)


@router.get("/{festival_id}/films")
def festival_films(
    festival_id: str,
    year: int | None = Query(None),
    page: Pagination = Depends(),
    repo: Repo = Depends(get_repo),
):
    return paginate(repo.festival_films(festival_id, year), page.page, page.limit)
