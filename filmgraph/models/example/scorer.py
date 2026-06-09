"""Example FilmGraph model: a weighted scoring function.

Models are functions, not services: scoped input in, output out. This example
ranks venues for a film by a few simple, transparent features. It reads only the
node/edge types declared in ``manifest.json`` (Film, Venue, SCREENED_AT,
DISTRIBUTED_BY) and makes no network calls.

``score`` is the manifest ``entrypoint``. FilmOS pre-filters the graph to the
declared types and passes it as ``context``.
"""

from __future__ import annotations

DEFAULT_PARAMETERS = {
    "independent_affinity": 0.45,
    "country_match": 0.35,
    "festival_pedigree": 0.20,
}


def score(context: dict, parameters: dict | None = None) -> list[dict]:
    """Rank venues for a film.

    ``context`` is the scoped graph::

        {
          "film": { ... Film node ... },
          "venues": [ { ... Venue node ... }, ... ],
          "screened_at": [ { "year": ..., ... }, ... ]   # the film's festival edges
        }

    Returns a list of ``{"venue_id", "score"}`` sorted high to low.
    """
    params = {**DEFAULT_PARAMETERS, **(parameters or {})}
    film = context.get("film", {})
    venues = context.get("venues", [])
    festival_count = len(context.get("screened_at", []))
    film_countries = set(film.get("origin_country", []))

    # Festival pedigree is a 0..1 saturating signal from how many festivals
    # selected the film.
    pedigree = min(festival_count / 5.0, 1.0)

    ranked: list[dict] = []
    for venue in venues:
        independent = 1.0 if venue.get("is_independent") else 0.0
        country_match = 1.0 if venue.get("country") in film_countries else 0.0
        value = (
            params["independent_affinity"] * independent
            + params["country_match"] * country_match
            + params["festival_pedigree"] * pedigree
        )
        ranked.append({"venue_id": venue.get("id"), "score": round(value, 4)})

    ranked.sort(key=lambda r: r["score"], reverse=True)
    return ranked
