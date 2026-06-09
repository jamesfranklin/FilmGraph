"""API key handling and tiered rate limiting.

Rate limits (per the brief):

- No API key: 60 requests / minute (keyed by client IP).
- Valid API key (matches ``FILMGRAPH_API_KEY``): 600 requests / minute.

The limiter is a self-contained in-memory sliding window — adequate for a single
public read-only instance. Behind multiple workers, prefer a shared store.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from starlette.requests import Request

from filmgraph import config

ANON_LIMIT = 60
AUTH_LIMIT = 600
WINDOW_SECONDS = 60.0


def extract_api_key(request: Request) -> str | None:
    return request.headers.get("X-API-Key") or request.query_params.get("api_key")


def is_authenticated(request: Request) -> bool:
    key = extract_api_key(request)
    return bool(key) and key == config.FILMGRAPH_API_KEY


class RateLimiter:
    def __init__(self, window: float = WINDOW_SECONDS):
        self.window = window
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, key: str, limit: int) -> bool:
        now = time.monotonic()
        with self._lock:
            bucket = self._hits[key]
            while bucket and now - bucket[0] >= self.window:
                bucket.popleft()
            if len(bucket) >= limit:
                return False
            bucket.append(now)
            return True

    def check_request(self, request: Request) -> tuple[bool, int]:
        """Return (allowed, limit) for the request's tier."""
        if is_authenticated(request):
            return self.allow(f"key:{extract_api_key(request)}", AUTH_LIMIT), AUTH_LIMIT
        client = request.client.host if request.client else "unknown"
        return self.allow(f"ip:{client}", ANON_LIMIT), ANON_LIMIT
