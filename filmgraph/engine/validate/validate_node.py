"""Validate a single node record against the FilmGraph schema."""

from __future__ import annotations

import json
from functools import lru_cache

from jsonschema import Draft202012Validator, FormatChecker

from filmgraph import config


@lru_cache(maxsize=1)
def load_node_schemas() -> dict:
    """Load and cache the node type schemas from schema/v1/nodes.json."""
    path = config.SCHEMA_VERSION_DIR / "nodes.json"
    return json.loads(path.read_text())


def node_types() -> list[str]:
    return sorted(load_node_schemas())


def validate_node(record: dict, node_type: str) -> list[str]:
    """Return a list of human-readable error strings. Empty means valid."""
    schemas = load_node_schemas()
    if node_type not in schemas:
        return [f"Unknown node type: {node_type!r}"]

    validator = Draft202012Validator(schemas[node_type], format_checker=FormatChecker())
    errors: list[str] = []
    for err in sorted(validator.iter_errors(record), key=lambda e: list(e.path)):
        location = "/".join(str(p) for p in err.path) or "(root)"
        errors.append(f"{location}: {err.message}")
    return errors
