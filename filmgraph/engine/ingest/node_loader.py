"""Shared node-seed ingest logic.

All node load scripts (load_venues, load_funders, load_awards, ...) follow the
same pattern: read JSONL, validate each record against the schema, skip if the
checkpoint says it is already loaded, MERGE to Neo4j, mark the checkpoint, then
log a summary. This helper implements that once so each load_*.py stays thin.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Callable

from filmgraph.engine.ingest.checkpoint import Checkpoint
from filmgraph.engine.ingest.neo4j_client import Neo4jClient
from filmgraph.engine.validate.validate_node import validate_node

logger = logging.getLogger("ingest")


def read_records(path: Path):
    for lineno, line in enumerate(path.read_text().splitlines(), start=1):
        line = line.strip()
        if not line:
            continue
        yield lineno, json.loads(line)


def load_node_seed(
    *,
    label: str,
    node_type: str,
    source: Path,
    job_name: str,
    id_key: str = "id",
    reset: bool = False,
    record_hook: Callable[[dict], list[str]] | None = None,
) -> int:
    """Load a JSONL node seed into Neo4j.

    ``label`` is the Neo4j label, ``node_type`` the schema type to validate
    against (usually equal to ``label``; differs for Organisation seeds such as
    funders). ``id_key`` is the merge key (``iso_code`` for Territory).
    ``record_hook`` may return extra per-record error strings (e.g. requiring a
    ``_source`` field on contributed seeds). Returns a process exit code.
    """
    checkpoint = Checkpoint(job_name)
    if reset:
        checkpoint.reset()
        checkpoint = Checkpoint(job_name)

    loaded = skipped = invalid = 0

    with Neo4jClient() as client:
        client.verify_connectivity()
        client.ensure_schema()

        for lineno, record in read_records(source):
            errors = validate_node(record, node_type)
            if record_hook:
                errors = errors + record_hook(record)
            if errors:
                invalid += 1
                logger.error("%s:%s invalid %s: %s", source.name, lineno, node_type, "; ".join(errors))
                continue

            key_value = record[id_key]
            if checkpoint.is_done(key_value):
                skipped += 1
                continue

            client.merge_node(label, id_key, key_value, record)
            checkpoint.mark_done(key_value)
            loaded += 1

    summary = f"{job_name} complete: loaded={loaded} skipped={skipped} invalid={invalid}"
    logger.info(summary)
    print(summary)
    return 1 if invalid else 0
