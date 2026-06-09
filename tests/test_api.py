"""Tests for the public API, backed by the in-memory (seed) repo."""

import pytest
from fastapi.testclient import TestClient

from filmgraph.api.deps import get_repo
from filmgraph.api.main import app
from filmgraph.api.repo import InMemoryRepo


@pytest.fixture
def client():
    repo = InMemoryRepo()
    app.dependency_overrides[get_repo] = lambda: repo
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def test_root_health(client):
    resp = client.get("/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["schema_version"] == "1.0.0"
    assert body["data"]["status"] == "ok"


def test_schema_endpoint_returns_full_schema(client):
    resp = client.get("/schema")
    assert resp.status_code == 200
    schema = resp.json()
    assert schema["version"] == "1.0.0"
    assert schema["$id"] == "https://filmgraph.org/schema/v1"
    assert "Film" in schema["node_types"]
    assert "SCREENED_AT" in schema["edge_types"]


def test_schema_version(client):
    resp = client.get("/schema/version")
    assert resp.status_code == 200
    assert resp.json()["data"] == "1.0.0"


def test_venue_search_watershed_gb(client):
    # Acceptance criterion.
    resp = client.get("/venues/search", params={"q": "watershed", "country": "GB"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["schema_version"] == "1.0.0"
    items = body["data"]["items"]
    assert len(items) == 1
    assert items[0]["name"] == "Watershed"
    assert items[0]["country"] == "GB"


def test_venue_search_country_filter_excludes(client):
    resp = client.get("/venues/search", params={"q": "watershed", "country": "US"})
    assert resp.json()["data"]["count"] == 0


def test_get_venue_by_id_and_404(client):
    found = client.get("/venues/search", params={"q": "watershed"}).json()["data"]["items"][0]
    resp = client.get(f"/venues/{found['id']}")
    assert resp.status_code == 200
    assert resp.json()["data"]["name"] == "Watershed"

    missing = client.get("/venues/11111111-1111-1111-1111-111111111111")
    assert missing.status_code == 404


def test_pagination_envelope_shape(client):
    body = client.get("/venues/search", params={"q": "e", "limit": 2}).json()
    data = body["data"]
    assert set(data) == {"page", "limit", "count", "items"}
    assert data["limit"] == 2
    assert len(data["items"]) <= 2


def test_limit_cap_rejects_over_100(client):
    resp = client.get("/venues/search", params={"q": "e", "limit": 1000})
    assert resp.status_code == 422


def test_distributor_search(client):
    items = client.get("/distributors/search", params={"q": "a24"}).json()["data"]["items"]
    assert any(d["name"] == "A24" for d in items)


def test_award_categories(client):
    award = next(iter(InMemoryRepo().award_bodies.values()))
    resp = client.get(f"/awards/{award['id']}/categories")
    assert resp.status_code == 200
    assert resp.json()["data"]["count"] >= 1


def test_territories_list_and_detail(client):
    territories = client.get("/territories").json()["data"]
    codes = {t["iso_code"] for t in territories}
    assert {"GB", "US"} <= codes

    gb = client.get("/territories/GB")
    assert gb.status_code == 200
    assert gb.json()["data"]["name"] == "United Kingdom"

    missing = client.get("/territories/ZZ")
    assert missing.status_code == 404


def test_film_not_found_when_no_films_loaded(client):
    resp = client.get("/films/999999")
    assert resp.status_code == 404
