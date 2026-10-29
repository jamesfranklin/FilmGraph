"""Film endpoints.

``{ref}`` is a film reference per docs/node-contract.md#film-references: a
UUID, a slug (``parasite-2019``) or a prefixed external id (``tmdb:496243``).
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from filmgraph import config
from filmgraph.api.deps import Pagination, get_repo
from filmgraph.api.models import envelope, paginate
from filmgraph.api.repo import Repo

router = APIRouter(prefix="/films", tags=["films"])

EXTERNAL_ID_PARAMS = ("tmdb", "imdb", "letterboxd", "wikidata", "eidr", "mx")


def _film_or_404(repo: Repo, ref: str) -> dict:
    film = repo.resolve_ref(ref)
    if film is None:
        raise HTTPException(status_code=404, detail=f"Film {ref} not found")
    return film


@router.get("/search")
def search_films(q: str = Query(..., min_length=1), page: Pagination = Depends(), repo: Repo = Depends(get_repo)):
    return paginate(repo.search_films(q), page.page, page.limit)


@router.get("/resolve")
def resolve_film(
    request: Request,
    title: str | None = None,
    year: int | None = None,
    repo: Repo = Depends(get_repo),
):
    external_ids = {k: v for k, v in request.query_params.items() if k in EXTERNAL_ID_PARAMS and v}
    if not external_ids and not (title and year):
        raise HTTPException(status_code=400, detail="Supply title and year, or at least one external id")
    return envelope({"items": repo.resolve_film(title, year, external_ids)})


@router.get("/{ref}")
def get_film(ref: str, repo: Repo = Depends(get_repo)):
    return envelope(_film_or_404(repo, ref))


@router.get("/{ref}/graph")
def film_graph(ref: str, repo: Repo = Depends(get_repo)):
    film = _film_or_404(repo, ref)
    body = repo.film_graph(film)
    body["node"] = config.NODE_ID
    body["generated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    return envelope(body)


@router.get("/{ref}/festivals")
def film_festivals(ref: str, page: Pagination = Depends(), repo: Repo = Depends(get_repo)):
    return paginate(repo.film_festivals(_film_or_404(repo, ref)), page.page, page.limit)


@router.get("/{ref}/awards")
def film_awards(ref: str, page: Pagination = Depends(), repo: Repo = Depends(get_repo)):
    return paginate(repo.film_awards(_film_or_404(repo, ref)), page.page, page.limit)


@router.get("/{ref}/distributors")
def film_distributors(ref: str, page: Pagination = Depends(), repo: Repo = Depends(get_repo)):
    return paginate(repo.film_distributors(_film_or_404(repo, ref)), page.page, page.limit)


@router.get("/{ref}/similar")
def film_similar(ref: str, page: Pagination = Depends(), repo: Repo = Depends(get_repo)):
    return paginate(repo.film_similar(_film_or_404(repo, ref)), page.page, page.limit)
