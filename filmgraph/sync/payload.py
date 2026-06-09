"""Build and dispatch the outbound sync notification on merge to main.

The payload tells registered instances what changed and whether a schema
migration is required before they ingest.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone

from filmgraph import config

DEFAULT_SYNC_BASE_URL = "https://api.filmgraph.org"


def _source_for_path(path: str) -> str | None:
    """Map a changed file path to a sync source identifier."""
    parts = path.strip().split("/")
    if not parts:
        return None
    if parts[0] == "schema":
        return "schema"
    if parts[0] == "seed" and len(parts) >= 2:
        area = parts[1]
        # Festival scrapers/outputs are per-festival, e.g. festivals/sundance.
        if area == "festivals" and len(parts) >= 3:
            stem = parts[-1].rsplit(".", 1)[0]
            if stem and stem not in ("scrapers", "output", "festival_list"):
                return f"festivals/{stem}"
        return area
    return None


def changed_sources(changed_files: list[str]) -> list[str]:
    sources: list[str] = []
    for path in changed_files:
        source = _source_for_path(path)
        if source and source not in sources:
            sources.append(source)
    return sources


def _major(version: str) -> int:
    return int(version.split(".")[0])


def build_payload(
    changed_files: list[str],
    previous_version: str | None = None,
    sync_base_url: str = DEFAULT_SYNC_BASE_URL,
) -> dict:
    previous_version = previous_version or config.SCHEMA_VERSION
    requires_migration = _major(config.SCHEMA_VERSION) > _major(previous_version)
    return {
        "schema_version": config.SCHEMA_VERSION,
        "previous_version": previous_version,
        "requires_migration": requires_migration,
        "changed_sources": changed_sources(changed_files),
        "sync_url": f"{sync_base_url.rstrip('/')}/sync/{{token}}",
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def post_notify(payload: dict, notify_url: str, sync_key: str) -> int:
    import requests

    response = requests.post(
        notify_url,
        json=payload,
        headers={"X-Sync-Key": sync_key},
        timeout=30,
    )
    print(f"POST {notify_url} -> {response.status_code}")
    return 0 if response.ok else 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build/dispatch the sync payload.")
    parser.add_argument("--changed-files", nargs="*", default=[], help="Changed file paths")
    parser.add_argument("--previous-version", default=None)
    parser.add_argument("--sync-base-url", default=os.environ.get("FILMGRAPH_SYNC_BASE_URL", DEFAULT_SYNC_BASE_URL))
    parser.add_argument("--notify-url", default=os.environ.get("FILMGRAPH_NOTIFY_URL"))
    parser.add_argument("--print-only", action="store_true")
    args = parser.parse_args(argv)

    payload = build_payload(args.changed_files, args.previous_version, args.sync_base_url)
    print(json.dumps(payload, indent=2))

    if args.print_only or not args.notify_url:
        return 0

    sync_key = config.FILMGRAPH_SYNC_KEY
    if not sync_key:
        print("FILMGRAPH_SYNC_KEY not set; cannot notify.", file=sys.stderr)
        return 2
    return post_notify(payload, args.notify_url, sync_key)


if __name__ == "__main__":
    sys.exit(main())
