"""Film endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from filmgraph.api.deps import Pagination, get_repo
from filmgraph.api.models import envelope, paginate
from filmgraph.api.repo import Repo

router = APIRouter(prefix="/films", tags=["films"])


@router.get("/search")
def search_films(q: str = Query(..., min_length=1), page: Pagination = Depends(), repo: Repo = Depends(get_repo)):
    return paginate(repo.search_films(q), page.page, page.limit)


@router.get("/{tmdb_id}")
def get_film(tmdb_id: int, repo: Repo = Depends(get_repo)):
    film = repo.get_film(tmdb_id)
    if film is None:
        raise HTTPException(status_code=404, detail=f"Film {tmdb_id} not found")
    return envelope(film)


@router.get("/{tmdb_id}/festivals")
def film_festivals(tmdb_id: int, page: Pagination = Depends(), repo: Repo = Depends(get_repo)):
    return paginate(repo.film_festivals(tmdb_id), page.page, page.limit)


@router.get("/{tmdb_id}/awards")
def film_awards(tmdb_id: int, page: Pagination = Depends(), repo: Repo = Depends(get_repo)):
    return paginate(repo.film_awards(tmdb_id), page.page, page.limit)


@router.get("/{tmdb_id}/distributors")
def film_distributors(tmdb_id: int, page: Pagination = Depends(), repo: Repo = Depends(get_repo)):
    return paginate(repo.film_distributors(tmdb_id), page.page, page.limit)


@router.get("/{tmdb_id}/similar")
def film_similar(tmdb_id: int, page: Pagination = Depends(), repo: Repo = Depends(get_repo)):
    return paginate(repo.film_similar(tmdb_id), page.page, page.limit)
