"""Unit tests for TF-IDF ranking + constraints. Fixtures are synthetic only."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.constraints import evaluate_constraints, haversine_km, schedule_fit
from app.main import app
from app.models import (
    ActivityIn,
    GeoPoint,
    PreferencesIn,
    RecommendRequest,
    TimeWindow,
)
from app.recommender import activity_document, preference_query, rank_activities


# --- Synthetic test fixtures (not product data) ---

HIKE = ActivityIn(
    id="test-hike-1",
    title="Sunrise Ridge Trail Hike",
    description="Moderate outdoor trail hike with scenic views",
    category="hiking",
    starts_at="2026-11-10T16:00:00+00:00",  # Tue 16:00 UTC
    latitude=37.77,
    longitude=-122.42,
    cost_cents=0,
    difficulty_label="beginner friendly",
)

VOLLEY = ActivityIn(
    id="test-volley-1",
    title="Indoor Volleyball Open Gym",
    description="Pickup volleyball and sports fitness session",
    category="sports",
    starts_at="2026-11-11T02:00:00+00:00",
    latitude=37.78,
    longitude=-122.41,
    cost_cents=1500,
    difficulty_label="intermediate",
)

EXPENSIVE = ActivityIn(
    id="test-expensive-1",
    title="Premium Climbing Clinic",
    description="Advanced climbing coaching",
    category="climbing",
    starts_at="2026-11-12T18:00:00+00:00",
    latitude=37.76,
    longitude=-122.43,
    cost_cents=9000,
    difficulty_label="advanced",
)

NO_COORDS = ActivityIn(
    id="test-nocoords-1",
    title="Mystery Meetup",
    description="Social meetup downtown",
    category="meetup",
    starts_at="2026-11-10T18:00:00+00:00",
    latitude=None,
    longitude=None,
    cost_cents=None,
    difficulty_label=None,
)


def base_prefs(**overrides) -> PreferencesIn:
    data = dict(
        preferred_categories=["hiking"],
        max_budget_cents=2500,
        max_distance_km=25,
        available_days=["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
        time_window=TimeWindow(start_hour=0, end_hour=23),
        skill_preference="any",
        starting_point=GeoPoint(lat=37.7749, lng=-122.4194),
    )
    data.update(overrides)
    return PreferencesIn(**data)


def test_preference_query_includes_categories():
    q = preference_query(base_prefs(preferred_categories=["hiking", "sports"]))
    assert "hiking" in q
    assert "sports" in q or "volleyball" in q


def test_activity_document_handles_empty_description():
    a = ActivityIn(id="x", title="Only Title", description="", category="other")
    assert activity_document(a)


def test_hike_ranks_above_unrelated_for_hiking_interest():
    result = rank_activities(
        RecommendRequest(
            preferences=base_prefs(preferred_categories=["hiking"]),
            activities=[HIKE, VOLLEY],
            limit=10,
        )
    )
    assert result.method == "tfidf-cosine"
    assert len(result.ranked) >= 1
    assert result.ranked[0].activity_id == "test-hike-1"
    assert result.ranked[0].relevance_score >= result.ranked[-1].relevance_score
    assert any(r.code == "text_relevance" for r in result.ranked[0].reasons)


def test_deterministic_for_identical_inputs():
    req = RecommendRequest(
        preferences=base_prefs(),
        activities=[HIKE, VOLLEY, EXPENSIVE],
        limit=10,
    )
    a = rank_activities(req)
    b = rank_activities(req)
    assert [i.activity_id for i in a.ranked] == [i.activity_id for i in b.ranked]
    assert [i.relevance_score for i in a.ranked] == [
        i.relevance_score for i in b.ranked
    ]


def test_empty_catalog():
    result = rank_activities(
        RecommendRequest(preferences=base_prefs(), activities=[], limit=5)
    )
    assert result.ranked == []
    assert result.catalog_size == 0


def test_unseen_interest_does_not_crash():
    result = rank_activities(
        RecommendRequest(
            preferences=base_prefs(
                preferred_categories=["other"],
                interest_text="underwater basket weaving xylophone",
            ),
            activities=[HIKE],
            limit=5,
        )
    )
    assert result.ok
    assert len(result.ranked) == 1


def test_budget_hard_filter_excludes_expensive():
    result = rank_activities(
        RecommendRequest(
            preferences=base_prefs(max_budget_cents=2000),
            activities=[HIKE, EXPENSIVE],
            limit=10,
        )
    )
    ids = {i.activity_id for i in result.ranked}
    assert "test-expensive-1" not in ids
    assert any(i.activity_id == "test-expensive-1" for i in result.excluded)


def test_missing_cost_not_fabricated_as_budget_match():
    excluded, _, reasons = evaluate_constraints(
        NO_COORDS,
        base_prefs(max_budget_cents=1000, starting_point=None),
    )
    assert not excluded  # unknown cost is not a hard fail
    assert any(r.code == "budget_unknown" for r in reasons)


def test_distance_excludes_far_activity():
    far = ActivityIn(
        id="test-far",
        title="Far Away Hike",
        description="Trail hike outdoors",
        category="hiking",
        starts_at="2026-11-10T16:00:00+00:00",
        latitude=47.6,
        longitude=-122.3,
        cost_cents=0,
    )
    result = rank_activities(
        RecommendRequest(
            preferences=base_prefs(max_distance_km=30),
            activities=[HIKE, far],
            limit=10,
        )
    )
    assert all(i.activity_id != "test-far" for i in result.ranked)
    assert any(i.activity_id == "test-far" for i in result.excluded)


def test_missing_coordinates_do_not_fabricate_distance_match():
    _, _, reasons = evaluate_constraints(
        NO_COORDS,
        base_prefs(starting_point=GeoPoint(lat=37.77, lng=-122.42)),
    )
    assert any(r.code == "distance_unknown" for r in reasons)
    assert not any(r.code == "within_distance" for r in reasons)


def test_schedule_mismatch_excludes():
    result = rank_activities(
        RecommendRequest(
            preferences=base_prefs(available_days=["sun"]),
            activities=[HIKE],  # Tue UTC
            limit=5,
        )
    )
    assert result.ranked == []
    assert result.excluded[0].excluded is True


def test_invalid_starts_at_is_schedule_unknown_not_mismatch():
    assert schedule_fit("not-a-date", ["mon"], 0, 23) == "unknown"


def test_haversine_sanity():
    # ~0 for same point
    assert haversine_km(37.77, -122.42, 37.77, -122.42) < 0.01


def test_health_endpoint():
    client = TestClient(app)
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert body["algorithm"] == "tfidf-cosine"


def test_recommendations_endpoint_schema():
    client = TestClient(app)
    res = client.post(
        "/recommendations",
        json={
            "preferences": {
                "preferred_categories": ["sports"],
                "max_budget_cents": 5000,
                "max_distance_km": 40,
                "available_days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
                "time_window": {"start_hour": 0, "end_hour": 23},
                "skill_preference": "any",
                "starting_point": {"lat": 37.77, "lng": -122.42},
            },
            "activities": [
                HIKE.model_dump(),
                VOLLEY.model_dump(),
            ],
            "limit": 5,
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["method"] == "tfidf-cosine"
    assert "ranked" in body
    assert all("activity_id" in row for row in body["ranked"])
    # Never invents ids outside the catalog
    catalog = {"test-hike-1", "test-volley-1"}
    for row in body["ranked"]:
        assert row["activity_id"] in catalog


def test_recommendations_rejects_invalid_lat():
    client = TestClient(app)
    res = client.post(
        "/recommendations",
        json={
            "preferences": {
                "preferred_categories": ["hiking"],
                "starting_point": {"lat": 999, "lng": 0},
            },
            "activities": [HIKE.model_dump()],
        },
    )
    assert res.status_code == 422


def test_accepts_large_travel_radius_used_by_discovery():
    client = TestClient(app)
    res = client.post(
        "/recommendations",
        json={
            "preferences": {
                "preferred_categories": ["hiking"],
                "max_distance_km": 5000,
                "starting_point": {"lat": 37.77, "lng": -122.42},
            },
            "activities": [HIKE.model_dump()],
            "limit": 5,
        },
    )
    assert res.status_code == 200
    assert res.json()["method"] == "tfidf-cosine"
