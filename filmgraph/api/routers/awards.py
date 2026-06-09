"""Award endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from filmgraph.api.deps import Pagination, get_repo
from filmgraph.api.models import envelope, paginate
from filmgraph.api.repo import Repo

router = APIRouter(prefix="/awards", tags=["awards"])


@router.get("/{award_id}")
def get_award_body(award_id: str, repo: Repo = Depends(get_repo)):
    body = repo.get_award_body(award_id)
    if body is None:
        raise HTTPException(status_code=404, detail=f"Award body {award_id} not found")
    return envelope(body)


@router.get("/{award_id}/categories")
def award_categories(award_id: str, page: Pagination = Depends(), repo: Repo = Depends(get_repo)):
    if repo.get_award_body(award_id) is None:
        raise HTTPException(status_code=404, detail=f"Award body {award_id} not found")
    return paginate(repo.award_categories(award_id), page.page, page.limit)


@router.get("/{award_id}/films")
def award_films(
    award_id: str,
    year: int | None = Query(None),
    page: Pagination = Depends(),
    repo: Repo = Depends(get_repo),
):
    return paginate(repo.award_films(award_id, year), page.page, page.limit)
