"""Registry of instances subscribed to sync notifications.

Stored in ``filmgraph/sync/registry.json`` — NOT committed (it contains the
endpoint URLs of private instances). Listed in .gitignore.
"""

from __future__ import annotations

import json
import secrets
from pathlib import Path

REGISTRY_PATH = Path(__file__).resolve().parent / "registry.json"


def _load() -> dict:
    if REGISTRY_PATH.exists():
        try:
            return json.loads(REGISTRY_PATH.read_text())
        except json.JSONDecodeError:
            return {}
    return {}


def _save(data: dict) -> None:
    REGISTRY_PATH.write_text(json.dumps(data, indent=2))


def register(url: str) -> str:
    """Register an endpoint URL, returning its sync token."""
    data = _load()
    for token, entry in data.items():
        if entry.get("url") == url:
            return token
    token = secrets.token_urlsafe(24)
    data[token] = {"url": url}
    _save(data)
    return token


def unregister(token: str) -> bool:
    data = _load()
    if token in data:
        del data[token]
        _save(data)
        return True
    return False


def get(token: str) -> dict | None:
    return _load().get(token)


def endpoints() -> list[dict]:
    return [{"token": token, **entry} for token, entry in _load().items()]
