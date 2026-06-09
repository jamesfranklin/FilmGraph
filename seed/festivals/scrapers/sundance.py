"""Sundance Film Festival programme scraper.

Reference implementation of :class:`BaseFestivalScraper`. Produces SCREENED_AT
edge records for Sundance editions.

IMPORTANT: festival websites change their markup over time. The CSS selectors in
``parse_programme`` are a starting point and may need updating against the
current Sundance site. Parsing is defensive — entries that cannot be read are
skipped (and logged), never raised. Output is written locally and is not
committed.

Usage::

    python seed/festivals/scrapers/sundance.py --start 2015 --end 2024
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

# Ensure sibling ``base`` is importable whether run as a script or imported.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from base import BaseFestivalScraper  # noqa: E402

logger = logging.getLogger("festival_scraper.sundance")

# Map common Sundance section names to the schema's section enum.
SECTION_MAP = {
    "u.s. dramatic competition": "competition",
    "u.s. documentary competition": "competition",
    "world cinema dramatic competition": "competition",
    "world cinema documentary competition": "competition",
    "premieres": "special",
    "spotlight": "special",
    "midnight": "sidebar",
    "next": "sidebar",
}


class SundanceScraper(BaseFestivalScraper):
    festival_id = "sundance"
    festival_name = "Sundance Film Festival"
    # Sundance's public programme archive. Adjust if the site path changes.
    archive_url_template = "https://www.sundance.org/festivals/sundance-film-festival/program/{year}"

    def parse_programme(self, html: str, year: int) -> list[dict]:
        from bs4 import BeautifulSoup

        soup = BeautifulSoup(html, "lxml")
        records: list[dict] = []

        # Each film is expected within a programme card. These selectors are a
        # best-effort starting point — verify against the live markup.
        for card in soup.select("[data-film], .film-card, article.film"):
            title_el = card.select_one(".film-title, h2, h3")
            if not title_el:
                continue
            title = title_el.get_text(strip=True)
            if not title:
                continue

            section_el = card.select_one(".film-section, .section")
            section_raw = section_el.get_text(strip=True).lower() if section_el else ""
            section = SECTION_MAP.get(section_raw)

            records.append(
                self.make_record(
                    film_title=title,
                    year=year,
                    section=section,
                )
            )

        if not records:
            logger.warning(
                "sundance %s: no films parsed — the site markup may have changed; "
                "update the selectors in parse_programme.",
                year,
            )
        return records


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
    parser = argparse.ArgumentParser(description="Scrape the Sundance programme.")
    parser.add_argument("--start", type=int, default=2010)
    parser.add_argument("--end", type=int, default=2024)
    parser.add_argument("--output-dir", default="seed/festivals/output")
    args = parser.parse_args(argv)

    scraper = SundanceScraper()
    records = scraper.scrape_range(args.start, args.end)
    path = scraper.save(records, Path(args.output_dir))
    print(f"sundance: wrote {len(records)} records to {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
