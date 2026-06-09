"""Export normalised venues from the Assemble showtimes MySQL database.

Reads a read-only MySQL connection from the ``MYSQL_READ_URL`` environment
variable (never hardcoded) and writes ``venues.jsonl`` — one Venue node record
per line, conforming to the FilmGraph Venue schema.

The committed ``venues.jsonl`` is a static snapshot. This script is provided so
that anyone can verify provenance and regenerate it. It is NOT required to run a
standard FilmGraph instance — only to refresh the snapshot.

Usage::

    export MYSQL_READ_URL='mysql+pymysql://user:password@host/database'
    python seed/venues/export.py --output seed/venues/venues.jsonl

Note on column mapping: the SELECT below maps the Assemble venues table to the
Venue node schema. Adjust the column names to match your own deployment if the
schema differs.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import uuid

# Stable namespace so a given venue always gets the same FilmGraph id across
# re-exports. Derived from venue identity (name + city + country), not from any
# Assemble internal primary key.
VENUE_NAMESPACE = uuid.UUID("6f1d2c84-0d6c-5f8a-9b3e-2a7c4f9e1b00")

# Maps source rows to Venue node properties. Override column names here if your
# Assemble schema differs.
QUERY = """
    SELECT
        name,
        city,
        country,
        address,
        state,
        postal_code,
        chain_id,
        is_independent,
        latitude,
        longitude,
        website
    FROM venues
    WHERE name IS NOT NULL AND city IS NOT NULL AND country IS NOT NULL
    ORDER BY country, city, name
"""


def venue_id(name: str, city: str, country: str) -> str:
    """Deterministic UUID for a venue from its identity."""
    key = f"{name.strip()}|{city.strip()}|{country.strip().upper()}"
    return str(uuid.uuid5(VENUE_NAMESPACE, key))


def _clean(row: dict) -> dict:
    """Map a source row to a Venue node record, dropping empty optionals."""
    name = str(row["name"]).strip()
    city = str(row["city"]).strip()
    country = str(row["country"]).strip().upper()

    record: dict = {
        "id": venue_id(name, city, country),
        "name": name,
        "city": city,
        "country": country,
    }
    for key in ("address", "state", "postal_code", "chain_id", "website"):
        value = row.get(key)
        if value not in (None, ""):
            record[key] = str(value).strip()
    if row.get("is_independent") is not None:
        record["is_independent"] = bool(row["is_independent"])
    for key in ("latitude", "longitude"):
        value = row.get(key)
        if value is not None:
            record[key] = float(value)
    return record


def export(output_path: str) -> int:
    url = os.environ.get("MYSQL_READ_URL")
    if not url:
        print("MYSQL_READ_URL is not set. See .env.example.", file=sys.stderr)
        return 2

    # Imported lazily so the script's helpers (venue_id, _clean) are importable
    # without SQLAlchemy installed.
    from sqlalchemy import create_engine, text

    engine = create_engine(url)
    count = 0
    with engine.connect() as conn, open(output_path, "w", encoding="utf-8") as fh:
        for row in conn.execute(text(QUERY)).mappings():
            record = _clean(dict(row))
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")
            count += 1
    print(f"Wrote {count} venues to {output_path}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Export Assemble venues to JSONL.")
    parser.add_argument("--output", default="seed/venues/venues.jsonl")
    args = parser.parse_args(argv)
    return export(args.output)


if __name__ == "__main__":
    sys.exit(main())
