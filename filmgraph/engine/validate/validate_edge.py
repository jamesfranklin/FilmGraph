"""Validate a single edge record against the FilmGraph schema.

Edge records use the envelope shape::

    {
      "edge_type": "SCREENED_AT",
      "source_id": "<source node id>",
      "target_id": "<target node id>",
      "properties": { ... }
    }
"""

from __future__ import annotations

import json
from functools import lru_cache

from jsonschema import Draft202012Validator, FormatChecker

from filmgraph import config


@lru_cache(maxsize=1)
def load_edge_schemas() -> dict:
    """Load and cache the edge type schemas from schema/v1/edges.json."""
    path = config.SCHEMA_VERSION_DIR / "edges.json"
    return json.loads(path.read_text())


def edge_types() -> list[str]:
    return sorted(load_edge_schemas())


def validate_edge(record: dict, edge_type: str | None = None) -> list[str]:
    """Return a list of human-readable error strings. Empty means valid.

    Reserved edge types (proprietary layer) are rejected: the public engine must
    never load them.
    """
    schemas = load_edge_schemas()
    et = edge_type or record.get("edge_type")
    if not et:
        return ["Missing edge_type"]
    if et not in schemas:
        return [f"Unknown edge type: {et!r}"]

    spec = schemas[et]
    errors: list[str] = []

    if spec.get("reserved"):
        errors.append(
            f"Edge type {et!r} is reserved for the proprietary layer and cannot "
            "be loaded in the public engine"
        )

    for key in ("source_id", "target_id"):
        value = record.get(key)
        if not value or not isinstance(value, str):
            errors.append(f"Missing or invalid {key}")

    properties = record.get("properties", {})
    if not isinstance(properties, dict):
        errors.append("properties must be an object")
    else:
        validator = Draft202012Validator(spec["properties"], format_checker=FormatChecker())
        for err in sorted(validator.iter_errors(properties), key=lambda e: list(e.path)):
            location = "/".join(str(p) for p in err.path) or "(properties)"
            errors.append(f"properties/{location}: {err.message}")

    return errors
