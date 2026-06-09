"""Scrape public historical box office figures from The Numbers.

Produces box office records mapped to films by title/year (and TMDB id where
known). Output is written to ``seed/box_office/output/box_office.jsonl`` and is
NOT committed (gitignored) — it is generated locally during ingest.

IMPORTANT: The Numbers' markup changes over time. The selectors here are a
best-effort starting point and may need updating against the live site. Parsing
is defensive — figures that cannot be read are skipped, never raised.

NOTE ON SCHEMA: FilmGraph v1 does not yet define a box-office node or edge type.
These records are attached to Film nodes as supplementary properties by
``load_box_office.py``; they are outside the validated v1 node schema. Formalise
a box-office schema element before relying on this in production.

Usage::

    python seed/box_office/the_numbers.py --titles seed/box_office/titles.csv
"""

from __future__ import annotations

import argparse
import csv
import json
import logging
import re
import sys
from pathlib import Path

import requests

logger = logging.getLogger("the_numbers")

BASE_URL = "https://www.the-numbers.com"


def _parse_money(text: str) -> int | None:
    digits = re.sub(r"[^0-9]", "", text or "")
    return int(digits) if digits else None


class TheNumbersScraper:
    def __init__(self, timeout: float = 20.0):
        self.timeout = timeout
        self._session = requests.Session()
        self._session.headers.update({"User-Agent": "FilmGraph box office scraper"})

    def fetch_movie_html(self, slug: str) -> str:
        url = f"{BASE_URL}/movie/{slug}"
        response = self._session.get(url, timeout=self.timeout)
        response.raise_for_status()
        return response.text

    def parse_movie(self, html: str, title: str, year: int | None, tmdb_id: int | None) -> dict | None:
        from bs4 import BeautifulSoup

        soup = BeautifulSoup(html, "lxml")
        record: dict = {"film_title": title, "territory": "US", "currency": "USD"}
        if year is not None:
            record["film_year"] = year
        if tmdb_id is not None:
            record["film_tmdb_id"] = tmdb_id

        found = False
        for row in soup.select("table tr"):
            cells = [c.get_text(strip=True) for c in row.select("td, th")]
            if len(cells) < 2:
                continue
            label = cells[0].lower()
            if "domestic" in label and "gross" in label:
                value = _parse_money(cells[1])
                if value:
                    record["total_gross"] = value
                    found = True
            elif "opening weekend" in label:
                value = _parse_money(cells[1])
                if value:
                    record["opening_weekend"] = value
                    found = True

        if not found:
            logger.warning("the-numbers: no figures parsed for %s — check selectors", title)
            return None
        return record


def read_titles(path: Path):
    with path.open(newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            yield row


def scrape(titles_path: Path, output_path: Path) -> int:
    scraper = TheNumbersScraper()
    records = []
    failed = 0
    for row in read_titles(titles_path):
        slug = (row.get("the_numbers_slug") or "").strip()
        title = (row.get("title") or "").strip()
        year = int(row["year"]) if row.get("year") else None
        tmdb_id = int(row["tmdb_id"]) if row.get("tmdb_id") else None
        if not slug or not title:
            continue
        try:
            html = scraper.fetch_movie_html(slug)
            record = scraper.parse_movie(html, title, year, tmdb_id)
        except Exception as exc:  # noqa: BLE001 - never abort the batch
            failed += 1
            logger.error("the-numbers: failed for %s: %s", title, exc)
            continue
        if record:
            records.append(record)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as fh:
        for record in records:
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")
    print(f"the_numbers: wrote {len(records)} records (failed={failed}) -> {output_path}")
    return 1 if failed else 0


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
    parser = argparse.ArgumentParser(description="Scrape box office from The Numbers.")
    parser.add_argument("--titles", default="seed/box_office/titles.csv")
    parser.add_argument("--output", default="seed/box_office/output/box_office.jsonl")
    args = parser.parse_args(argv)
    return scrape(Path(args.titles), Path(args.output))


if __name__ == "__main__":
    sys.exit(main())
