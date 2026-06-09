"""Validate committed JSONL seed files against the FilmGraph schema.

Used by the GitHub Action (validate.yml). Exits non-zero if any record fails,
so a contributed file with a schema error fails the PR.

Usage::

    python -m filmgraph.engine.validate.validate_file --file seed/venues/venues.jsonl --type Venue
    python -m filmgraph.engine.validate.validate_file --glob "seed/**/*.jsonl"
"""

from __future__ import annotations

import argparse
import glob as globlib
import json
import sys
from pathlib import Path

from filmgraph.engine.validate.validate_edge import edge_types, validate_edge
from filmgraph.engine.validate.validate_node import node_types, validate_node

# Maps a committed JSONL filename stem to the node type its records represent.
# Used when validating via --glob without an explicit --type.
FILE_TYPE_MAP: dict[str, str] = {
    "venues": "Venue",
    "funders": "Organisation",
    "award_bodies": "AwardBody",
    "award_categories": "AwardCategory",
    "distributors": "Distributor",
    "practitioners": "Practitioner",
    "markets": "Market",
}


def _validate_record(record: dict, type_name: str) -> list[str]:
    if type_name in node_types():
        return validate_node(record, type_name)
    if type_name in edge_types():
        return validate_edge(record, type_name)
    return [f"Unknown schema type: {type_name!r}"]


def validate_file(path: Path, type_name: str) -> tuple[int, int, list[str]]:
    """Validate every JSON line. Returns (valid_count, invalid_count, messages)."""
    valid = 0
    invalid = 0
    messages: list[str] = []
    for lineno, line in enumerate(path.read_text().splitlines(), start=1):
        line = line.strip()
        if not line:
            continue
        try:
            record = json.loads(line)
        except json.JSONDecodeError as exc:
            invalid += 1
            messages.append(f"{path}:{lineno}: invalid JSON: {exc}")
            continue
        errors = _validate_record(record, type_name)
        if errors:
            invalid += 1
            for err in errors:
                messages.append(f"{path}:{lineno}: {err}")
        else:
            valid += 1
    return valid, invalid, messages


def _type_for_path(path: Path, explicit: str | None) -> str | None:
    if explicit:
        return explicit
    return FILE_TYPE_MAP.get(path.stem)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate FilmGraph JSONL seed files.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--file", help="Path to a single JSONL file")
    group.add_argument("--glob", help="Glob pattern for multiple JSONL files")
    parser.add_argument("--type", help="Node or edge type name (required with --file)")
    args = parser.parse_args(argv)

    if args.file:
        paths = [Path(args.file)]
    else:
        paths = [Path(p) for p in sorted(globlib.glob(args.glob, recursive=True))]

    total_valid = 0
    total_invalid = 0
    all_messages: list[str] = []
    checked_any = False

    for path in paths:
        type_name = _type_for_path(path, args.type)
        if type_name is None:
            print(f"SKIP  {path} (no type mapping; pass --type to validate)")
            continue
        checked_any = True
        valid, invalid, messages = validate_file(path, type_name)
        total_valid += valid
        total_invalid += invalid
        all_messages.extend(messages)
        status = "OK  " if invalid == 0 else "FAIL"
        print(f"{status}  {path} [{type_name}]  valid={valid} invalid={invalid}")

    for msg in all_messages:
        print(f"  {msg}")

    if not checked_any:
        print("No files validated.")
        return 1

    print(f"\nTotal: valid={total_valid} invalid={total_invalid}")
    return 1 if total_invalid else 0


if __name__ == "__main__":
    sys.exit(main())
