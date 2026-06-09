"""Data access layer for the public API.

Two backends implement the same interface:

- ``InMemoryRepo`` loads the committed seed files (venues, funders, awards,
  distributors, practitioners, festivals, and films if generated locally). It
  needs no database, powers the test suite, and lets the API serve node lookups
  and searches out of the box.
- ``Neo4jRepo`` queries a live Neo4j instance via Cypher, including relationship
  traversals.

Relationship edges (SCREENED_AT, DISTRIBUTED_BY, ...) are not committed to the
public repo, so ``InMemoryRepo`` returns empty lists for traversals. Reserved
edges (EXHIBITED_AT) are never served by the public API.
"""

from __future__ import annotations

import csv
import json
from pathlib import Path

from filmgraph import config
from filmgraph.engine.ingest.ids import festival_node_id

# Minimal ISO 3166-1 alpha-2 names for territories referenced by the seed data.
ISO_NAMES = {
    "GB": "United Kingdom",
    "US": "United States",
    "AU": "Australia",
    "NZ": "New Zealand",
    "FR": "France",
    "DE": "Germany",
    "IT": "Italy",
    "CA": "Canada",
    "CH": "Switzerland",
    "ES": "Spain",
    "NL": "Netherlands",
    "IE": "Ireland",
}


def _read_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    records = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if line:
            records.append(json.loads(line))
    return records


class Repo:
    """Interface implemented by both backends."""

    # Films
    def get_film(self, tmdb_id: int) -> dict | None: ...
    def film_festivals(self, tmdb_id: int) -> list[dict]: ...
    def film_awards(self, tmdb_id: int) -> list[dict]: ...
    def film_distributors(self, tmdb_id: int) -> list[dict]: ...
    def film_similar(self, tmdb_id: int) -> list[dict]: ...
    def search_films(self, q: str) -> list[dict]: ...

    # Venues
    def get_venue(self, venue_id: str) -> dict | None: ...
    def venue_films(self, venue_id: str) -> list[dict]: ...
    def search_venues(self, q: str, country: str | None) -> list[dict]: ...

    # Festivals
    def get_festival(self, festival_id: str) -> dict | None: ...
    def festival_films(self, festival_id: str, year: int | None) -> list[dict]: ...
    def search_festivals(self, q: str) -> list[dict]: ...

    # Distributors
    def get_distributor(self, distributor_id: str) -> dict | None: ...
    def distributor_films(self, distributor_id: str, territory: str | None) -> list[dict]: ...
    def search_distributors(self, q: str) -> list[dict]: ...

    # Awards
    def get_award_body(self, award_id: str) -> dict | None: ...
    def award_categories(self, award_id: str) -> list[dict]: ...
    def award_films(self, award_id: str, year: int | None) -> list[dict]: ...

    # Practitioners
    def get_practitioner(self, practitioner_id: str) -> dict | None: ...
    def practitioner_films(self, practitioner_id: str) -> list[dict]: ...

    # Organisations
    def get_organisation(self, organisation_id: str) -> dict | None: ...
    def organisation_films(self, organisation_id: str) -> list[dict]: ...

    # Territories
    def territories(self) -> list[dict]: ...
    def get_territory(self, iso_code: str) -> dict | None: ...


class InMemoryRepo(Repo):
    def __init__(self) -> None:
        seed = config.SEED_DIR
        self.venues = {v["id"]: v for v in _read_jsonl(seed / "venues" / "venues.jsonl")}
        self.organisations = {o["id"]: o for o in _read_jsonl(seed / "funders" / "funders.jsonl")}
        self.distributors = {d["id"]: d for d in _read_jsonl(seed / "distributors" / "distributors.jsonl")}
        self.award_bodies = {a["id"]: a for a in _read_jsonl(seed / "awards" / "award_bodies.jsonl")}

        self.categories_by_body: dict[str, list[dict]] = {}
        for cat in _read_jsonl(seed / "awards" / "award_categories.jsonl"):
            self.categories_by_body.setdefault(cat["award_body_id"], []).append(cat)

        # Strip provenance from practitioner records for API output.
        self.practitioners = {}
        for p in _read_jsonl(seed / "practitioners" / "practitioners.jsonl"):
            self.practitioners[p["id"]] = {k: v for k, v in p.items() if k != "_source"}

        self.festivals = {}
        festival_csv = seed / "festivals" / "festival_list.csv"
        if festival_csv.exists():
            with festival_csv.open(newline="", encoding="utf-8") as fh:
                for row in csv.DictReader(fh):
                    node = {
                        "id": festival_node_id(row["festival_id"]),
                        "name": row["name"].strip(),
                        "city": row["city"].strip(),
                        "country": row["country"].strip().upper(),
                        "tier": row["tier"].strip(),
                        "festival_type": row["festival_type"].strip(),
                    }
                    if row.get("website"):
                        node["website"] = row["website"].strip()
                    if row.get("founded_year"):
                        node["founded_year"] = int(row["founded_year"])
                    self.festivals[node["id"]] = node

        self.films_by_tmdb = {}
        for f in _read_jsonl(seed / "films" / "films.jsonl"):
            self.films_by_tmdb[int(f["tmdb_id"])] = f

    # Films
    def get_film(self, tmdb_id):
        return self.films_by_tmdb.get(tmdb_id)

    def film_festivals(self, tmdb_id):
        return []

    def film_awards(self, tmdb_id):
        return []

    def film_distributors(self, tmdb_id):
        return []

    def film_similar(self, tmdb_id):
        return []

    def search_films(self, q):
        ql = q.lower()
        return [f for f in self.films_by_tmdb.values() if ql in f.get("title", "").lower()]

    # Venues
    def get_venue(self, venue_id):
        return self.venues.get(venue_id)

    def venue_films(self, venue_id):
        return []  # EXHIBITED_AT is reserved; never served publicly.

    def search_venues(self, q, country):
        ql = q.lower()
        results = [v for v in self.venues.values() if ql in v.get("name", "").lower()]
        if country:
            cu = country.upper()
            results = [v for v in results if v.get("country") == cu]
        return results

    # Festivals
    def get_festival(self, festival_id):
        return self.festivals.get(festival_id)

    def festival_films(self, festival_id, year):
        return []

    def search_festivals(self, q):
        ql = q.lower()
        return [f for f in self.festivals.values() if ql in f.get("name", "").lower()]

    # Distributors
    def get_distributor(self, distributor_id):
        return self.distributors.get(distributor_id)

    def distributor_films(self, distributor_id, territory):
        return []

    def search_distributors(self, q):
        ql = q.lower()
        return [d for d in self.distributors.values() if ql in d.get("name", "").lower()]

    # Awards
    def get_award_body(self, award_id):
        return self.award_bodies.get(award_id)

    def award_categories(self, award_id):
        return self.categories_by_body.get(award_id, [])

    def award_films(self, award_id, year):
        return []

    # Practitioners
    def get_practitioner(self, practitioner_id):
        return self.practitioners.get(practitioner_id)

    def practitioner_films(self, practitioner_id):
        return []

    # Organisations
    def get_organisation(self, organisation_id):
        return self.organisations.get(organisation_id)

    def organisation_films(self, organisation_id):
        return []

    # Territories
    def _referenced_territories(self) -> set[str]:
        codes: set[str] = set()
        for v in self.venues.values():
            if v.get("country"):
                codes.add(v["country"])
        for f in self.festivals.values():
            if f.get("country"):
                codes.add(f["country"])
        for d in self.distributors.values():
            codes.update(d.get("territory", []))
        for o in self.organisations.values():
            codes.update(o.get("territory", []))
        return codes

    def territories(self):
        return [
            {"iso_code": code, "name": ISO_NAMES.get(code, code)}
            for code in sorted(self._referenced_territories())
        ]

    def get_territory(self, iso_code):
        iso_code = iso_code.upper()
        if iso_code in self._referenced_territories():
            return {"iso_code": iso_code, "name": ISO_NAMES.get(iso_code, iso_code)}
        return None


class Neo4jRepo(Repo):
    """Live Neo4j backend. Queries are unverified against a running instance in
    CI; the in-memory backend powers the test suite."""

    def __init__(self, client=None):
        from filmgraph.engine.ingest.neo4j_client import Neo4jClient

        self._client = client or Neo4jClient()

    def _one(self, cypher: str, **params) -> dict | None:
        with self._client.session() as session:
            record = session.run(cypher, **params).single()
            return dict(record["n"]) if record and record["n"] is not None else None

    def _many(self, cypher: str, key: str = "n", **params) -> list[dict]:
        with self._client.session() as session:
            return [dict(r[key]) for r in session.run(cypher, **params) if r[key] is not None]

    # Films
    def get_film(self, tmdb_id):
        return self._one("MATCH (n:Film {tmdb_id: $t}) RETURN n", t=tmdb_id)

    def film_festivals(self, tmdb_id):
        return self._many(
            "MATCH (:Film {tmdb_id: $t})-[:SCREENED_AT]->(n:Festival) RETURN n", t=tmdb_id
        )

    def film_awards(self, tmdb_id):
        return self._many(
            "MATCH (:Film {tmdb_id: $t})-[:NOMINATED_FOR|WON]->(n:AwardCategory) RETURN n", t=tmdb_id
        )

    def film_distributors(self, tmdb_id):
        return self._many(
            "MATCH (:Film {tmdb_id: $t})-[:DISTRIBUTED_BY]->(n:Distributor) RETURN n", t=tmdb_id
        )

    def film_similar(self, tmdb_id):
        return self._many(
            "MATCH (:Film {tmdb_id: $t})-[:SIMILAR_TO]-(n:Film) RETURN n", t=tmdb_id
        )

    def search_films(self, q):
        return self._many(
            "MATCH (n:Film) WHERE toLower(n.title) CONTAINS toLower($q) RETURN n LIMIT 200", q=q
        )

    # Venues
    def get_venue(self, venue_id):
        return self._one("MATCH (n:Venue {id: $id}) RETURN n", id=venue_id)

    def venue_films(self, venue_id):
        return []  # EXHIBITED_AT is reserved; never served publicly.

    def search_venues(self, q, country):
        if country:
            return self._many(
                "MATCH (n:Venue) WHERE toLower(n.name) CONTAINS toLower($q) "
                "AND n.country = $c RETURN n LIMIT 200",
                q=q,
                c=country.upper(),
            )
        return self._many(
            "MATCH (n:Venue) WHERE toLower(n.name) CONTAINS toLower($q) RETURN n LIMIT 200", q=q
        )

    # Festivals
    def get_festival(self, festival_id):
        return self._one("MATCH (n:Festival {id: $id}) RETURN n", id=festival_id)

    def festival_films(self, festival_id, year):
        if year is not None:
            return self._many(
                "MATCH (n:Film)-[s:SCREENED_AT]->(:Festival {id: $id}) WHERE s.year = $y RETURN n",
                id=festival_id,
                y=year,
            )
        return self._many(
            "MATCH (n:Film)-[:SCREENED_AT]->(:Festival {id: $id}) RETURN n", id=festival_id
        )

    def search_festivals(self, q):
        return self._many(
            "MATCH (n:Festival) WHERE toLower(n.name) CONTAINS toLower($q) RETURN n LIMIT 200", q=q
        )

    # Distributors
    def get_distributor(self, distributor_id):
        return self._one("MATCH (n:Distributor {id: $id}) RETURN n", id=distributor_id)

    def distributor_films(self, distributor_id, territory):
        if territory:
            return self._many(
                "MATCH (n:Film)-[d:DISTRIBUTED_BY]->(:Distributor {id: $id}) "
                "WHERE d.territory = $terr RETURN n",
                id=distributor_id,
                terr=territory.upper(),
            )
        return self._many(
            "MATCH (n:Film)-[:DISTRIBUTED_BY]->(:Distributor {id: $id}) RETURN n", id=distributor_id
        )

    def search_distributors(self, q):
        return self._many(
            "MATCH (n:Distributor) WHERE toLower(n.name) CONTAINS toLower($q) RETURN n LIMIT 200", q=q
        )

    # Awards
    def get_award_body(self, award_id):
        return self._one("MATCH (n:AwardBody {id: $id}) RETURN n", id=award_id)

    def award_categories(self, award_id):
        return self._many(
            "MATCH (n:AwardCategory {award_body_id: $id}) RETURN n", id=award_id
        )

    def award_films(self, award_id, year):
        cypher = (
            "MATCH (n:Film)-[r:NOMINATED_FOR|WON]->(:AwardCategory {award_body_id: $id}) "
        )
        if year is not None:
            cypher += "WHERE r.ceremony_year = $y "
        cypher += "RETURN DISTINCT n"
        return self._many(cypher, id=award_id, y=year)

    # Practitioners
    def get_practitioner(self, practitioner_id):
        return self._one("MATCH (n:Practitioner {id: $id}) RETURN n", id=practitioner_id)

    def practitioner_films(self, practitioner_id):
        return self._many(
            "MATCH (:Practitioner {id: $id})-[:WORKED_ON]->(n:Film) RETURN n", id=practitioner_id
        )

    # Organisations
    def get_organisation(self, organisation_id):
        return self._one("MATCH (n:Organisation {id: $id}) RETURN n", id=organisation_id)

    def organisation_films(self, organisation_id):
        return self._many(
            "MATCH (:Organisation {id: $id})-[:FUNDED|REPRESENTED_BY]->(n:Film) RETURN n",
            id=organisation_id,
        )

    # Territories
    def territories(self):
        return self._many("MATCH (n:Territory) RETURN n ORDER BY n.iso_code")

    def get_territory(self, iso_code):
        return self._one("MATCH (n:Territory {iso_code: $c}) RETURN n", c=iso_code.upper())
