"""FilmGraph node conformance suite.

Runs against any node::

    FILMGRAPH_NODE_URL=https://filmgraph.docsociety.org FILMGRAPH_NODE_KEY=... pytest conformance/

With no ``FILMGRAPH_NODE_URL`` it runs in-process against the Python reference
node loaded with ``tests/fixtures/films.jsonl`` — which is how CI keeps the
reference honest.

Fixtures expose a thin ``node`` client. Tests only use the public contract
(docs/node-contract.md); nothing here imports node internals except to boot
the reference in the fallback case.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import httpx
import pytest
from jsonschema import Draft202012Validator

REPO_ROOT = Path(__file__).resolve().parent.parent
SCHEMA_DIR = REPO_ROOT / "schema" / "v1"


def _load_schema(name: str) -> dict:
    return json.loads((SCHEMA_DIR / name).read_text())


class Node:
    def __init__(self, client: httpx.Client, key: str | None):
        self.client = client
        self.key = key
        self._manifest: dict | None = None

    def get(self, path: str, *, auth: bool = True, **params) -> httpx.Response:
        headers = {"X-API-Key": self.key} if (auth and self.key) else {}
        return self.client.get(path, params=params or None, headers=headers)

    @property
    def manifest(self) -> dict:
        if self._manifest is None:
            resp = self.get("/.well-known/filmgraph", auth=False)
            assert resp.status_code == 200, "manifest must be reachable without a key"
            self._manifest = resp.json()["data"]
        return self._manifest

    def has(self, capability: str) -> bool:
        return capability in self.manifest.get("capabilities", [])

    def serves(self, node_type: str) -> bool:
        return node_type in self.manifest.get("node_types", [])


@pytest.fixture(scope="session")
def node() -> Node:
    url = os.environ.get("FILMGRAPH_NODE_URL")
    key = os.environ.get("FILMGRAPH_NODE_KEY")
    if url:
        with httpx.Client(base_url=url.rstrip("/"), timeout=30, follow_redirects=True) as client:
            yield Node(client, key)
        return

    # Fallback: in-process reference node.
    from fastapi.testclient import TestClient

    from filmgraph.api.deps import get_repo
    from filmgraph.api.main import app
    from filmgraph.api.repo import InMemoryRepo

    repo = InMemoryRepo(films_path=REPO_ROOT / "tests" / "fixtures" / "films.jsonl")
    app.dependency_overrides[get_repo] = lambda: repo
    with TestClient(app) as client:
        yield Node(client, key)
    app.dependency_overrides.clear()


@pytest.fixture(scope="session")
def node_schemas() -> dict:
    return _load_schema("nodes.json")


@pytest.fixture(scope="session")
def edge_schemas() -> dict:
    return _load_schema("edges.json")


@pytest.fixture(scope="session")
def validate_node(node_schemas):
    validators = {name: Draft202012Validator(schema) for name, schema in node_schemas.items()}

    def _validate(node_type: str, record: dict) -> None:
        errors = sorted(validators[node_type].iter_errors(record), key=lambda e: list(e.path))
        assert not errors, f"{node_type} record fails schema: " + "; ".join(e.message for e in errors[:5])

    return _validate


@pytest.fixture(scope="session")
def sample_film(node) -> dict:
    """A film the node actually holds, found through the public surface."""
    # Operators can pin one for determinism; otherwise discover via search.
    ref = os.environ.get("FILMGRAPH_SAMPLE_FILM")
    if ref:
        resp = node.get(f"/films/{ref}")
        assert resp.status_code == 200, f"FILMGRAPH_SAMPLE_FILM={ref} not found on node"
        return resp.json()["data"]
    for q in ("the", "a", "e", "o"):
        resp = node.get("/films/search", q=q, limit=1)
        if resp.status_code == 200 and resp.json()["data"]["items"]:
            return resp.json()["data"]["items"][0]
    pytest.fail("could not discover a sample film via /films/search; set FILMGRAPH_SAMPLE_FILM")
