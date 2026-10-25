"""Typed request/response models for the recommendation API."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator


DayOfWeek = Literal["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
SkillPreference = Literal["beginner", "intermediate", "advanced", "any"]
Category = Literal[
    "hiking",
    "cycling",
    "running",
    "outdoor",
    "meetup",
    "climbing",
    "sports",
    "other",
]


class GeoPoint(BaseModel):
    lat: float
    lng: float

    @field_validator("lat")
    @classmethod
    def lat_range(cls, v: float) -> float:
        if not -90 <= v <= 90:
            raise ValueError("lat must be between -90 and 90")
        return v

    @field_validator("lng")
    @classmethod
    def lng_range(cls, v: float) -> float:
        if not -180 <= v <= 180:
            raise ValueError("lng must be between -180 and 180")
        return v


class TimeWindow(BaseModel):
    start_hour: int = Field(ge=0, le=23)
    end_hour: int = Field(ge=0, le=23)


class PreferencesIn(BaseModel):
    preferred_categories: list[Category] = Field(default_factory=list)
    max_budget_cents: int | None = Field(default=None, ge=0)
    # Allow wide travel radii used by discovery prefs; hard filter still applies.
    max_distance_km: float = Field(default=25, gt=0, le=20_000)
    available_days: list[DayOfWeek] = Field(default_factory=list)
    time_window: TimeWindow = Field(
        default_factory=lambda: TimeWindow(start_hour=0, end_hour=23)
    )
    skill_preference: SkillPreference = "any"
    starting_point: GeoPoint | None = None
    interest_text: str | None = Field(
        default=None,
        description="Optional free-text interests appended to the TF-IDF query.",
    )


class ActivityIn(BaseModel):
    id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    description: str = ""
    category: Category | str = "other"
    starts_at: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    cost_cents: int | None = Field(default=None, ge=0)
    difficulty_label: str | None = None


class RecommendRequest(BaseModel):
    preferences: PreferencesIn
    activities: list[ActivityIn] = Field(default_factory=list, max_length=500)
    limit: int = Field(default=20, ge=1, le=100)


class ReasonOut(BaseModel):
    code: str
    label: str


class RankedItemOut(BaseModel):
    activity_id: str
    relevance_score: float = Field(
        description="Cosine similarity in [0, 1] after hard filters. Not a predicted enjoyment probability."
    )
    reasons: list[ReasonOut]
    excluded: bool = False
    exclusion_reason: str | None = None


class RecommendResponse(BaseModel):
    ok: bool = True
    method: Literal["tfidf-cosine"] = "tfidf-cosine"
    method_note: str
    ranked: list[RankedItemOut]
    excluded: list[RankedItemOut]
    catalog_size: int
    candidate_size: int


class HealthResponse(BaseModel):
    ok: bool
    service: str
    version: str
    algorithm: str
