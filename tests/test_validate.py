"""Tests for the node and edge validation engine."""

from filmgraph.engine.validate.validate_edge import validate_edge
from filmgraph.engine.validate.validate_node import validate_node

UUID = "11111111-1111-1111-1111-111111111111"


# --- Node validation ---------------------------------------------------------

def test_valid_venue_passes():
    venue = {
        "id": UUID,
        "name": "Watershed",
        "city": "Bristol",
        "country": "GB",
        "is_independent": True,
    }
    assert validate_node(venue, "Venue") == []


def test_venue_missing_required_field_fails():
    venue = {"id": UUID, "name": "Watershed", "country": "GB"}  # no city
    errors = validate_node(venue, "Venue")
    assert any("city" in e for e in errors)


def test_venue_bad_country_pattern_fails():
    venue = {"id": UUID, "name": "X", "city": "Bristol", "country": "GBR"}
    errors = validate_node(venue, "Venue")
    assert errors


def test_venue_bad_uuid_fails():
    venue = {"id": "not-a-uuid", "name": "X", "city": "Bristol", "country": "GB"}
    errors = validate_node(venue, "Venue")
    assert errors


def test_venue_additional_property_fails():
    venue = {"id": UUID, "name": "X", "city": "Bristol", "country": "GB", "bogus": 1}
    errors = validate_node(venue, "Venue")
    assert errors


def test_venue_source_field_allowed():
    venue = {"id": UUID, "name": "X", "city": "Bristol", "country": "GB", "_source": "test"}
    assert validate_node(venue, "Venue") == []


def test_film_bad_enum_fails():
    film = {"id": UUID, "tmdb_id": 1, "title": "X", "year": 2020, "budget_tier": "huge"}
    errors = validate_node(film, "Film")
    assert errors


def test_valid_film_passes():
    film = {"id": UUID, "tmdb_id": 42, "title": "X", "year": 2020, "budget_tier": "low"}
    assert validate_node(film, "Film") == []


def test_unknown_node_type():
    errors = validate_node({"id": UUID}, "Nope")
    assert errors and "Unknown node type" in errors[0]


def test_territory_uses_iso_code_key():
    assert validate_node({"iso_code": "GB", "name": "United Kingdom"}, "Territory") == []
    assert validate_node({"id": UUID, "name": "X"}, "Territory")  # missing iso_code


# --- Edge validation ---------------------------------------------------------

def test_valid_screened_at_edge_passes():
    edge = {
        "edge_type": "SCREENED_AT",
        "source_id": UUID,
        "target_id": UUID,
        "properties": {"year": 2021, "section": "competition", "premiere_status": "world"},
    }
    assert validate_edge(edge) == []


def test_screened_at_missing_required_year_fails():
    edge = {"edge_type": "SCREENED_AT", "source_id": UUID, "target_id": UUID, "properties": {}}
    errors = validate_edge(edge)
    assert any("year" in e for e in errors)


def test_reserved_edge_rejected():
    edge = {"edge_type": "EXHIBITED_AT", "source_id": UUID, "target_id": UUID, "properties": {}}
    errors = validate_edge(edge)
    assert any("reserved" in e for e in errors)


def test_edge_missing_source_id_fails():
    edge = {"edge_type": "WON", "target_id": UUID, "properties": {"year": 2020, "ceremony_year": 2021}}
    errors = validate_edge(edge)
    assert any("source_id" in e for e in errors)


def test_unknown_edge_type_fails():
    edge = {"edge_type": "NOPE", "source_id": UUID, "target_id": UUID, "properties": {}}
    errors = validate_edge(edge)
    assert errors and "Unknown edge type" in errors[0]


def test_edge_bad_enum_in_properties_fails():
    edge = {
        "edge_type": "DISTRIBUTED_BY",
        "source_id": UUID,
        "target_id": UUID,
        "properties": {"territory": "US", "deal_type": "bogus"},
    }
    errors = validate_edge(edge)
    assert errors
