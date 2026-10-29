"""Contract checks. Section headings mirror docs/node-contract.md."""

from __future__ import annotations

import re

import pytest

SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*-[0-9]{4}(?:-[0-9]+)?$")
VERSION_RE = re.compile(r"^1\.\d+\.\d+$")
KNOWN_CAPABILITIES = {"films.graph", "films.resolve", "films.search", "venues", "festivals", "distributors", "mcp", "sync"}


# --- Node manifest -----------------------------------------------------------

def test_manifest_shape(node):
    m = node.manifest
    assert re.fullmatch(r"[a-z0-9-]+", m["node_id"])
    assert m["name"]
    assert m["operator"]["name"] and m["operator"]["url"].startswith("http")
    assert m["layer"] in (1, 2)
    assert m["auth"] in ("none", "optional", "required")
    assert isinstance(m["node_types"], list) and "Film" in m["node_types"]
    assert isinstance(m["edge_types"], list)
    assert set(m["capabilities"]) <= KNOWN_CAPABILITIES, "unknown capability string"
    if "mcp" in m["capabilities"]:
        assert m["mcp"]["url"].startswith("http")


def test_manifest_types_exist_in_schema(node, node_schemas, edge_schemas):
    assert set(node.manifest["node_types"]) <= set(node_schemas)
    assert set(node.manifest["edge_types"]) <= set(edge_schemas)


def test_manifest_is_enveloped(node):
    body = node.get("/.well-known/filmgraph", auth=False).json()
    assert VERSION_RE.match(body["schema_version"])
    assert "data" in body


# --- Envelope & errors -------------------------------------------------------

def test_not_found_error_envelope(node):
    resp = node.get("/films/this-film-does-not-exist-1900")
    assert resp.status_code == 404
    body = resp.json()
    assert body["error"] == "not_found"
    assert VERSION_RE.match(body["schema_version"])
    assert "data" not in body


def test_bare_integer_ref_is_not_a_tmdb_id(node):
    # v1 addressed films by bare tmdb id. v1.1 requires the tmdb: prefix.
    # A bare integer may legitimately be a slug-less miss, but it must never
    # resolve to a film by TMDB id.
    resp = node.get("/films/496243")
    assert resp.status_code == 404


# --- Authentication ----------------------------------------------------------

def test_key_required_when_manifest_says_so(node):
    if node.manifest["auth"] != "required":
        pytest.skip("node does not require a key")
    resp = node.get("/films/search", auth=False, q="a")
    assert resp.status_code == 401
    assert resp.json()["error"] == "unauthorized"


def test_bad_key_is_401_not_403(node):
    if node.manifest["auth"] == "none":
        pytest.skip("node has no auth")
    resp = node.client.get("/films/search", params={"q": "a"}, headers={"X-API-Key": "definitely-not-a-key"})
    if node.manifest["auth"] == "optional":
        # An optional-auth node may ignore a bad key or reject it; it must not 403.
        assert resp.status_code in (200, 401)
    else:
        assert resp.status_code == 401


# --- Film identity -----------------------------------------------------------

def test_film_validates_against_schema(sample_film, validate_node):
    validate_node("Film", sample_film)


def test_film_has_slug_and_uuid(sample_film):
    assert SLUG_RE.match(sample_film["slug"]), sample_film["slug"]
    assert re.fullmatch(r"[0-9a-f-]{36}", sample_film["id"])


def test_slug_ends_with_year(sample_film):
    year_part = sample_film["slug"].rsplit("-", 2)
    assert str(sample_film["year"]) in year_part


def test_resolve_by_uuid(node, sample_film):
    resp = node.get(f"/films/{sample_film['id']}")
    assert resp.status_code == 200
    assert resp.json()["data"]["id"] == sample_film["id"]


def test_resolve_by_slug(node, sample_film):
    resp = node.get(f"/films/{sample_film['slug']}")
    assert resp.status_code == 200
    assert resp.json()["data"]["id"] == sample_film["id"]


def test_resolve_by_slug_is_case_insensitive(node, sample_film):
    resp = node.get(f"/films/{sample_film['slug'].upper()}")
    assert resp.status_code == 200
    assert resp.json()["data"]["id"] == sample_film["id"]


def test_resolve_by_external_id(node, sample_film):
    ext = sample_film.get("external_ids") or {}
    if not ext:
        pytest.skip("sample film carries no external ids")
    system, value = next(iter(ext.items()))
    resp = node.get(f"/films/{system}:{value}")
    assert resp.status_code == 200
    assert resp.json()["data"]["id"] == sample_film["id"]


# --- /films/resolve ----------------------------------------------------------

def test_resolve_endpoint_exact(node, sample_film):
    if not node.has("films.resolve"):
        pytest.skip("node does not advertise films.resolve")
    title = sample_film.get("title_en") or sample_film["title"]
    resp = node.get("/films/resolve", title=title, year=sample_film["year"])
    assert resp.status_code == 200
    items = resp.json()["data"]["items"]
    assert items, "exact title+year must resolve"
    top = items[0]
    assert top["film"]["id"] == sample_film["id"]
    assert top["matched_on"] in ("slug", "fuzzy") or top["matched_on"].startswith("external_ids.")
    assert 0 < top["confidence"] <= 1


def test_resolve_endpoint_year_adjacent(node, sample_film):
    if not node.has("films.resolve"):
        pytest.skip("node does not advertise films.resolve")
    title = sample_film.get("title_en") or sample_film["title"]
    resp = node.get("/films/resolve", title=title, year=sample_film["year"] + 1)
    assert resp.status_code == 200
    items = resp.json()["data"]["items"]
    ids = [i["film"]["id"] for i in items]
    assert sample_film["id"] in ids
    hit = next(i for i in items if i["film"]["id"] == sample_film["id"])
    assert hit["confidence"] < 0.8 or hit["matched_on"].startswith("external_ids.")


def test_resolve_endpoint_external_id_wins(node, sample_film):
    if not node.has("films.resolve"):
        pytest.skip("node does not advertise films.resolve")
    ext = sample_film.get("external_ids") or {}
    if not ext:
        pytest.skip("sample film carries no external ids")
    system, value = next(iter(ext.items()))
    resp = node.get("/films/resolve", **{system: value})
    assert resp.status_code == 200
    top = resp.json()["data"]["items"][0]
    assert top["film"]["id"] == sample_film["id"]
    assert top["confidence"] == 1.0
    assert top["matched_on"] == f"external_ids.{system}"


def test_resolve_endpoint_empty_is_200(node):
    if not node.has("films.resolve"):
        pytest.skip("node does not advertise films.resolve")
    resp = node.get("/films/resolve", title="zzqx no such film", year=1901)
    assert resp.status_code == 200
    assert resp.json()["data"]["items"] == []


def test_resolve_endpoint_requires_input(node):
    if not node.has("films.resolve"):
        pytest.skip("node does not advertise films.resolve")
    resp = node.get("/films/resolve")
    assert resp.status_code == 400
    assert resp.json()["error"] == "bad_request"


# --- Composite document ------------------------------------------------------

def test_graph_document_shape(node, sample_film, validate_node, edge_schemas, node_schemas):
    if not node.has("films.graph"):
        pytest.skip("node does not advertise films.graph")
    resp = node.get(f"/films/{sample_film['slug']}/graph")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["node"] == node.manifest["node_id"]
    assert data["film"]["id"] == sample_film["id"]
    validate_node("Film", data["film"])
    assert isinstance(data["edges"], dict)
    assert re.match(r"\d{4}-\d{2}-\d{2}T", data["generated_at"])
    advertised = set(node.manifest["edge_types"])
    for edge_type, entries in data["edges"].items():
        assert edge_type in edge_schemas, f"unknown edge type {edge_type}"
        assert isinstance(entries, list)
        if entries:
            assert edge_type in advertised, f"{edge_type} served but not in manifest.edge_types"
        for entry in entries:
            assert set(entry) >= {"edge", "target"}
            assert isinstance(entry["edge"], dict)
            assert "id" in entry["target"]
    if data.get("truncated"):
        assert "edge_counts" in data


def test_graph_targets_validate(node, sample_film, validate_node, edge_schemas):
    if not node.has("films.graph"):
        pytest.skip("node does not advertise films.graph")
    data = node.get(f"/films/{sample_film['slug']}/graph").json()["data"]
    checked = 0
    for edge_type, entries in data["edges"].items():
        target_type = (edge_schemas[edge_type].get("to") or {}).get("type") if isinstance(edge_schemas[edge_type].get("to"), dict) else None
        for entry in entries[:5]:
            t = entry["target"]
            node_type = t.get("_type") or target_type
            if node_type and node_type in node.manifest["node_types"]:
                validate_node(node_type, {k: v for k, v in t.items() if k != "_type"})
                checked += 1
    # Nothing to assert when the sample film has no edges; the shape test covers that.


def test_graph_404_for_unknown_ref(node):
    if not node.has("films.graph"):
        pytest.skip("node does not advertise films.graph")
    resp = node.get("/films/no-such-film-1900/graph")
    assert resp.status_code == 404


# --- Search ------------------------------------------------------------------

def test_search_pagination_envelope(node, sample_film):
    if not node.has("films.search"):
        pytest.skip("node does not advertise films.search")
    title = sample_film.get("title_en") or sample_film["title"]
    resp = node.get("/films/search", q=title.split()[0], limit=5)
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert set(data) >= {"page", "limit", "count", "items"}
    assert len(data["items"]) <= 5
    assert any(i["id"] == sample_film["id"] for i in data["items"]) or data["count"] > 5


def test_search_results_validate(node, sample_film, validate_node):
    if not node.has("films.search"):
        pytest.skip("node does not advertise films.search")
    title = sample_film.get("title_en") or sample_film["title"]
    for item in node.get("/films/search", q=title.split()[0], limit=5).json()["data"]["items"]:
        validate_node("Film", item)


# --- Venues (optional capability) --------------------------------------------

def test_venue_search_when_advertised(node, validate_node):
    if not node.has("venues"):
        pytest.skip("node does not advertise venues")
    resp = node.get("/venues/search", q="a", limit=5)
    assert resp.status_code == 200
    items = resp.json()["data"]["items"]
    for v in items:
        validate_node("Venue", v)
    if items:
        one = node.get(f"/venues/{items[0]['id']}")
        assert one.status_code == 200
        assert one.json()["data"]["id"] == items[0]["id"]
