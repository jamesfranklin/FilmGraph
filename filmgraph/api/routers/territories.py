"""Territory endpoints (global)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from filmgraph.api.deps import get_repo
from filmgraph.api.models import envelope
from filmgraph.api.repo import Repo

router = APIRouter(prefix="/territories", tags=["territories"])


@router.get("")
def list_territories(repo: Repo = Depends(get_repo)):
    return envelope(repo.territories())


@router.get("/{iso_code}")
def get_territory(iso_code: str, repo: Repo = Depends(get_repo)):
    territory = repo.get_territory(iso_code)
    if territory is None:
        raise HTTPException(status_code=404, detail=f"Territory {iso_code} not found")
    return envelope(territory)
