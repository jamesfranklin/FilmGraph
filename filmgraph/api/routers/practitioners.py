"""Practitioner endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from filmgraph.api.deps import Pagination, get_repo
from filmgraph.api.models import envelope, paginate
from filmgraph.api.repo import Repo

router = APIRouter(prefix="/practitioners", tags=["practitioners"])


@router.get("/{practitioner_id}")
def get_practitioner(practitioner_id: str, repo: Repo = Depends(get_repo)):
    practitioner = repo.get_practitioner(practitioner_id)
    if practitioner is None:
        raise HTTPException(status_code=404, detail=f"Practitioner {practitioner_id} not found")
    return envelope(practitioner)


@router.get("/{practitioner_id}/films")
def practitioner_films(practitioner_id: str, page: Pagination = Depends(), repo: Repo = Depends(get_repo)):
    return paginate(repo.practitioner_films(practitioner_id), page.page, page.limit)
