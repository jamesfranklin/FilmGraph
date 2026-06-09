"""Distributor endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from filmgraph.api.deps import Pagination, get_repo
from filmgraph.api.models import envelope, paginate
from filmgraph.api.repo import Repo

router = APIRouter(prefix="/distributors", tags=["distributors"])


@router.get("/search")
def search_distributors(q: str = Query(..., min_length=1), page: Pagination = Depends(), repo: Repo = Depends(get_repo)):
    return paginate(repo.search_distributors(q), page.page, page.limit)


@router.get("/{distributor_id}")
def get_distributor(distributor_id: str, repo: Repo = Depends(get_repo)):
    distributor = repo.get_distributor(distributor_id)
    if distributor is None:
        raise HTTPException(status_code=404, detail=f"Distributor {distributor_id} not found")
    return envelope(distributor)


@router.get("/{distributor_id}/films")
def distributor_films(
    distributor_id: str,
    territory: str | None = Query(None, min_length=2, max_length=2),
    page: Pagination = Depends(),
    repo: Repo = Depends(get_repo),
):
    return paginate(repo.distributor_films(distributor_id, territory), page.page, page.limit)
