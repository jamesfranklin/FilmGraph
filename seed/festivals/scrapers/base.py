"""Base class for festival programme scrapers.

A festival scraper produces ``SCREENED_AT`` edge records for the films a festival
selected, by year. Output is written to
``seed/festivals/output/{festival_id}.jsonl`` (gitignored — generated locally).

The record shape matches the generic festival converter template so the two
contribution paths are interchangeable::

    {
      "festival_id": "sundance",
      "film_title": "...",
      "film_year": 2020,            # optional
      "film_tmdb_id": 496243,       # optional; flagged for manual match if absent
      "year": 2020,                 # festival edition year (required)
      "section": "competition",     # optional, schema enum
      "premiere_status": "world",   # optional, schema enum
      "award_won": "Grand Jury Prize"  # optional
    }

Subclasses set ``festival_id`` (must match ``festival_list.csv``) and implement
``parse_programme``. ``parse_programme`` is intentionally site-specific: festival
websites differ, and their markup changes over time, so a scraper's selectors may
need updating. Keep parsing defensive — skip entries you cannot read rather than
raising.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

import requests

logger = logging.getLogger("festival_scraper")

VALID_SECTIONS = {"competition", "sidebar", "special", "retrospective", "market"}
VALID_PREMIERE = {"world", "international", "european", "regional", "none"}


class BaseFestivalScraper:
    festival_id: str = ""
    festival_name: str = ""
    # ``{year}`` is substituted with the edition year.
    archive_url_template: str = ""

    def __init__(self, timeout: float = 20.0):
        if not self.festival_id:
            raise ValueError(f"{type(self).__name__} must set festival_id")
        self.timeout = timeout
        self._session = requests.Session()
        self._session.headers.update({"User-Agent": "FilmGraph festival scraper"})

    # --- To implement in subclasses ---------------------------------------

    def parse_programme(self, html: str, year: int) -> list[dict]:
        """Parse one edition's programme HTML into raw SCREENED_AT records.

        Subclasses must override. Return a list of dicts; use ``make_record`` to
        build each one.
        """
        raise NotImplementedError

    # --- Driver ------------------------------------------------------------

    def fetch_programme_html(self, year: int) -> str:
        if not self.archive_url_template:
            raise NotImplementedError(f"{type(self).__name__} must set archive_url_template")
        url = self.archive_url_template.format(year=year)
        response = self._session.get(url, timeout=self.timeout)
        response.raise_for_status()
        return response.text

    def scrape(self, year: int) -> list[dict]:
        """Return SCREENED_AT edge records for a single edition year."""
        try:
            html = self.fetch_programme_html(year)
        except Exception as exc:  # noqa: BLE001 - log and return empty, never abort a range
            logger.error("%s %s: fetch failed: %s", self.festival_id, year, exc)
            return []
        records = self.parse_programme(html, year)
        logger.info("%s %s: %d records", self.festival_id, year, len(records))
        return records

    def scrape_range(self, start_year: int, end_year: int) -> list[dict]:
        records: list[dict] = []
        for year in range(start_year, end_year + 1):
            records.extend(self.scrape(year))
        return records

    # --- Helpers -----------------------------------------------------------

    def make_record(
        self,
        *,
        film_title: str,
        year: int,
        film_year: int | None = None,
        film_tmdb_id: int | None = None,
        section: str | None = None,
        premiere_status: str | None = None,
        award_won: str | None = None,
    ) -> dict:
        record: dict = {
            "festival_id": self.festival_id,
            "film_title": film_title.strip(),
            "year": year,
        }
        if film_year is not None:
            record["film_year"] = film_year
        if film_tmdb_id is not None:
            record["film_tmdb_id"] = film_tmdb_id
        if section and section in VALID_SECTIONS:
            record["section"] = section
        if premiere_status and premiere_status in VALID_PREMIERE:
            record["premiere_status"] = premiere_status
        if award_won:
            record["award_won"] = award_won
        return record

    def save(self, records: list[dict], output_dir: Path) -> Path:
        output_dir.mkdir(parents=True, exist_ok=True)
        path = output_dir / f"{self.festival_id}.jsonl"
        with path.open("w", encoding="utf-8") as fh:
            for record in records:
                fh.write(json.dumps(record, ensure_ascii=False) + "\n")
        return path
