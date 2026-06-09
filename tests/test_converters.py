"""Tests for the generic festival converter."""

from filmgraph import config
from filmgraph.models.converters.generic_festival.converter import GenericFestivalConverter

TEMPLATE = str(
    config.PACKAGE_ROOT / "models" / "converters" / "generic_festival" / "template.csv"
)


def test_convert_reads_all_rows():
    records = GenericFestivalConverter().convert(TEMPLATE)
    assert len(records) == 3
    assert records[0]["film_title"] == "Parasite"
    assert records[0]["film_tmdb_id"] == 496243
    assert records[0]["year"] == 2019


def test_validate_output_splits_valid_and_flagged():
    converter = GenericFestivalConverter()
    records = converter.convert(TEMPLATE)
    valid, flagged = converter.validate_output(records)
    # Two rows have a tmdb_id and valid props; one row has no tmdb_id -> flagged.
    assert len(valid) == 2
    assert len(flagged) == 1
    assert any("film_tmdb_id" in e for e in flagged[0]["errors"])


def test_missing_year_is_flagged():
    converter = GenericFestivalConverter()
    record = {"film_title": "X", "festival_name": "F", "film_tmdb_id": 1}  # no year
    errors = converter.validate_record(record)
    assert any("year" in e for e in errors)


def test_bad_section_enum_is_flagged():
    converter = GenericFestivalConverter()
    record = {
        "film_title": "X",
        "festival_name": "F",
        "film_tmdb_id": 1,
        "year": 2020,
        "section": "nonsense",
    }
    errors = converter.validate_record(record)
    assert any("section" in e for e in errors)


def test_valid_record_has_no_errors():
    converter = GenericFestivalConverter()
    record = {
        "film_title": "X",
        "festival_name": "F",
        "film_tmdb_id": 1,
        "year": 2020,
        "section": "competition",
        "premiere_status": "world",
    }
    assert converter.validate_record(record) == []


def test_write_output(tmp_path):
    converter = GenericFestivalConverter()
    valid, _ = converter.validate_output(converter.convert(TEMPLATE))
    out = tmp_path / "out.jsonl"
    converter.write_output(valid, str(out))
    lines = [ln for ln in out.read_text().splitlines() if ln.strip()]
    assert len(lines) == 2
