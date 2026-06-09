"""Tests for committed seed files: the publications reference seed and the
two-tier film id list."""

import csv
import importlib.util
import json

from filmgraph import config
from filmgraph.engine.validate.validate_node import validate_node

PUBLICATIONS = config.SEED_DIR / "publications" / "publications.jsonl"
FILM_IDS = config.SEED_DIR / "films" / "film_ids.csv"
VALID_TIERS = {"core", "extended"}


def _read_jsonl(path):
    with path.open(encoding="utf-8") as fh:
        return [json.loads(line) for line in fh if line.strip()]


# --- Publications seed -------------------------------------------------------

def test_publications_seed_exists_and_nonempty():
    records = _read_jsonl(PUBLICATIONS)
    assert len(records) >= 1


def test_publications_all_valid_against_schema():
    for record in _read_jsonl(PUBLICATIONS):
        errors = validate_node(record, "Publication")
        assert errors == [], f"{record.get('name')!r}: {errors}"


def test_publications_ids_unique():
    ids = [r["id"] for r in _read_jsonl(PUBLICATIONS)]
    assert len(ids) == len(set(ids))


def test_publications_names_unique():
    names = [r["name"] for r in _read_jsonl(PUBLICATIONS)]
    assert len(names) == len(set(names))


# --- Film id tiers -----------------------------------------------------------

def test_film_ids_have_valid_tiers():
    with FILM_IDS.open(newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    assert rows, "film_ids.csv has no data rows"
    for row in rows:
        tier = (row.get("tier") or "").strip().lower() or "core"
        assert tier in VALID_TIERS, f"bad tier {tier!r} for {row.get('tmdb_id')}"


def test_film_ids_unique():
    with FILM_IDS.open(newline="", encoding="utf-8") as fh:
        ids = [row["tmdb_id"].strip() for row in csv.DictReader(fh)]
    assert len(ids) == len(set(ids))


# --- read_ids tier filtering -------------------------------------------------

def _load_tmdb_fetch():
    path = config.SEED_DIR / "films" / "tmdb_fetch.py"
    spec = importlib.util.spec_from_file_location("tmdb_fetch", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_read_ids_tier_filtering():
    tmdb_fetch = _load_tmdb_fetch()
    all_ids = tmdb_fetch.read_ids(FILM_IDS, tier="all")
    core_ids = tmdb_fetch.read_ids(FILM_IDS, tier="core")
    extended_ids = tmdb_fetch.read_ids(FILM_IDS, tier="extended")

    assert set(core_ids).isdisjoint(extended_ids)
    assert sorted(all_ids) == sorted(core_ids + extended_ids)
    assert core_ids, "expected at least one core film"
    assert extended_ids, "expected at least one extended film"


def test_read_ids_default_is_all():
    tmdb_fetch = _load_tmdb_fetch()
    assert sorted(tmdb_fetch.read_ids(FILM_IDS)) == sorted(
        tmdb_fetch.read_ids(FILM_IDS, tier="all")
    )
