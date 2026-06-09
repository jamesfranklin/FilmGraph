"""Organisation endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from filmgraph.api.deps import Pagination, get_repo
from filmgraph.api.models import envelope, paginate
from filmgraph.api.repo import Repo

router = APIRouter(prefix="/organisations", tags=["organisations"])


@router.get("/{organisation_id}")
def get_organisation(organisation_id: str, repo: Repo = Depends(get_repo)):
    organisation = repo.get_organisation(organisation_id)
    if organisation is None:
        raise HTTPException(status_code=404, detail=f"Organisation {organisation_id} not found")
    return envelope(organisation)


@router.get("/{organisation_id}/films")
def organisation_films(organisation_id: str, page: Pagination = Depends(), repo: Repo = Depends(get_repo)):
    return paginate(repo.organisation_films(organisation_id), page.page, page.limit)
