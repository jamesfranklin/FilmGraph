"""Minimal TMDB API client.

Reads the API key from the ``TMDB_API_KEY`` environment variable ONLY. There is
no other code path for supplying the key. Operators must supply their own key and
comply with the TMDB terms of service (see ``seed/films/README.md``).
"""

from __future__ import annotations

import requests

from filmgraph import config

BASE_URL = "https://api.themoviedb.org/3"


class TMDBError(RuntimeError):
    pass


class TMDBClient:
    def __init__(self, api_key: str | None = None, timeout: float = 15.0):
        self.api_key = api_key or config.TMDB_API_KEY
        if not self.api_key:
            raise TMDBError(
                "TMDB_API_KEY is not set. Supply your own TMDB API key via the "
                "environment (see .env.example and seed/films/README.md)."
            )
        self.timeout = timeout
        self._session = requests.Session()

    def get_movie(self, tmdb_id: int) -> dict:
        """Fetch a movie with keywords appended."""
        url = f"{BASE_URL}/movie/{tmdb_id}"
        params = {"api_key": self.api_key, "append_to_response": "keywords"}
        response = self._session.get(url, params=params, timeout=self.timeout)
        if response.status_code == 404:
            raise TMDBError(f"TMDB movie {tmdb_id} not found")
        response.raise_for_status()
        return response.json()
