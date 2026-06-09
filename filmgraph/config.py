"""Central configuration and path resolution for FilmGraph.

All credentials are read from environment variables only. No secret value is
ever hardcoded here. Paths are resolved relative to the repository root so that
importable code under ``filmgraph/`` can find committed data under ``schema/``
and ``seed/`` at the repo root.
"""

from __future__ import annotations

import os
from pathlib import Path

try:  # Optional: load a local .env if python-dotenv is installed.
    from dotenv import load_dotenv

    load_dotenv()
except Exception:  # pragma: no cover - dotenv is optional at runtime.
    pass

# filmgraph/config.py -> filmgraph/ -> repo root
PACKAGE_ROOT = Path(__file__).resolve().parent
REPO_ROOT = PACKAGE_ROOT.parent

SCHEMA_DIR = REPO_ROOT / "schema"
SCHEMA_VERSION_DIR = SCHEMA_DIR / "v1"
SEED_DIR = REPO_ROOT / "seed"
CACHE_DIR = REPO_ROOT / "cache"
CHECKPOINT_DIR = CACHE_DIR / "checkpoints"

# Current schema version. Kept in sync with schema/v1/filmgraph.json.
SCHEMA_VERSION = "1.0.0"


def _env(name: str, default: str | None = None) -> str | None:
    value = os.environ.get(name, default)
    return value


# Neo4j
NEO4J_URI = _env("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = _env("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = _env("NEO4J_PASSWORD")

# TMDB (seed tooling only)
TMDB_API_KEY = _env("TMDB_API_KEY")
TMDB_CACHE_PATH = _env("TMDB_CACHE_PATH", str(CACHE_DIR / "tmdb"))

# Public API
FILMGRAPH_API_KEY = _env("FILMGRAPH_API_KEY")

# Sync
FILMGRAPH_SYNC_KEY = _env("FILMGRAPH_SYNC_KEY")

# Venues export (Assemble read-only MySQL) - used only by seed/venues/export.py
MYSQL_READ_URL = _env("MYSQL_READ_URL")
