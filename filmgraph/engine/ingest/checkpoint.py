"""File-based checkpointing for resumable, idempotent ingest jobs.

Every ingest script uses a Checkpoint so a re-run skips records already loaded.
State is stored in ``cache/checkpoints/{job_name}.json``. ``cache/`` is
gitignored, so checkpoint state is never committed.
"""

from __future__ import annotations

import json

from filmgraph import config


class Checkpoint:
    def __init__(self, job_name: str):
        self.job_name = job_name
        self.path = config.CHECKPOINT_DIR / f"{job_name}.json"
        self._done: set[str] = self._load()

    def _load(self) -> set[str]:
        if self.path.exists():
            try:
                return set(json.loads(self.path.read_text()))
            except (json.JSONDecodeError, ValueError):
                return set()
        return set()

    def _save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(sorted(self._done)))

    def is_done(self, record_id: str) -> bool:
        return record_id in self._done

    def mark_done(self, record_id: str) -> None:
        if record_id not in self._done:
            self._done.add(record_id)
            self._save()

    def reset(self) -> None:
        self._done = set()
        if self.path.exists():
            self.path.unlink()

    def __len__(self) -> int:
        return len(self._done)
