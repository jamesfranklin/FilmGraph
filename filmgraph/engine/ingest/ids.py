"""Deterministic node-id helpers.

Some nodes are keyed by an external identifier rather than a committed UUID:
Film nodes by TMDB id, Festival nodes by a festival slug (the ``festival_id``
used by scrapers and ``festival_list.csv``). Computing their UUIDs the same way
everywhere keeps ingest idempotent and lets edges resolve to the right nodes.
"""

from __future__ import annotations

import re
import unicodedata
import uuid

FILM_NAMESPACE = uuid.UUID("f0a1b2c3-4d5e-5f60-9a8b-7c6d5e4f3a21")
FESTIVAL_NAMESPACE = uuid.UUID("a1b2c3d4-5e6f-5071-8293-a4b5c6d7e8f9")


def film_id(tmdb_id: int) -> str:
    return str(uuid.uuid5(FILM_NAMESPACE, f"tmdb:{tmdb_id}"))


def festival_node_id(slug: str) -> str:
    return str(uuid.uuid5(FESTIVAL_NAMESPACE, f"festival:{slug.strip().lower()}"))


def film_id_from_slug(slug: str) -> str:
    """UUID for a film that has no TMDB id. Keyed by slug, so two loads of the
    same record produce the same node; but a slug can change (title or year
    correction), so prefer ``film_id`` whenever a TMDB id exists."""
    return str(uuid.uuid5(FILM_NAMESPACE, f"slug:{slug}"))


_NON_SLUG = re.compile(r"[^a-z0-9]+")


def film_slug(title: str, year: int, suffix: int | None = None) -> str:
    """Derive the FilmGraph slug per docs/node-contract.md#film-identity.

    - NFKD-fold to ASCII, lowercase, collapse runs of non-alphanumerics to ``-``.
    - Leading articles are kept ("the-end-of-the-line-2009").
    - ``&`` becomes ``and``; apostrophes vanish rather than splitting a word
      ("Gods Don't Give Gifts" -> ``gods-dont-give-gifts-2026``).
    - ``suffix`` is the per-node collision disambiguator (2, 3, ...), never 1.
    """
    t = title.replace("&", " and ").replace("'", "").replace("\u2019", "")
    t = unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode()
    t = _NON_SLUG.sub("-", t.lower()).strip("-")
    if not t:
        raise ValueError("title produced an empty slug")
    slug = f"{t}-{int(year)}"
    if suffix is not None:
        if suffix < 2:
            raise ValueError("collision suffix starts at 2")
        slug += f"-{suffix}"
    return slug


_PREFIXED = re.compile(r"^([a-z]+):(.+)$")


def parse_film_ref(ref: str) -> tuple[str, str]:
    """Classify a film reference: ('uuid'|'slug'|<external system>, value)."""
    ref = ref.strip()
    try:
        uuid.UUID(ref)
        return "uuid", ref
    except ValueError:
        pass
    m = _PREFIXED.match(ref)
    if m and m.group(1) not in ("http", "https"):
        return m.group(1), m.group(2)
    return "slug", ref.lower()
