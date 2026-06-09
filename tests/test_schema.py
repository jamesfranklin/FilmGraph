"""Tests that the committed schema files are well-formed and self-consistent."""

import json

from jsonschema import Draft202012Validator

from filmgraph import config


def _load(name):
    return json.loads((config.SCHEMA_VERSION_DIR / name).read_text())


def test_filmgraph_json_metadata():
    fg = _load("filmgraph.json")
    assert fg["version"] == "1.0.0"
    assert fg["version"] == config.SCHEMA_VERSION
    assert fg["$id"] == "https://filmgraph.org/schema/v1"
    assert fg["node_types"] == {"$ref": "nodes.json"}
    assert fg["edge_types"] == {"$ref": "edges.json"}


def test_node_schemas_are_valid_json_schema():
    nodes = _load("nodes.json")
    assert len(nodes) == 12
    for name, schema in nodes.items():
        Draft202012Validator.check_schema(schema)
        assert schema["type"] == "object", name


def test_edge_schemas_are_valid_json_schema():
    edges = _load("edges.json")
    assert len(edges) == 18
    for name, spec in edges.items():
        assert isinstance(spec["source"], list) and spec["source"], name
        assert isinstance(spec["target"], list) and spec["target"], name
        Draft202012Validator.check_schema(spec["properties"])


def test_reserved_edges_present_and_marked():
    edges = _load("edges.json")
    for name in ("EXHIBITED_AT", "SHAPE_MATCHES"):
        assert edges[name]["reserved"] is True


def test_public_edges_not_reserved():
    edges = _load("edges.json")
    assert edges["SCREENED_AT"].get("reserved") is False
