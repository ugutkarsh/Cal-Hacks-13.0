"""Deterministic hard constraints — not part of the TF-IDF model."""

from __future__ import annotations

import math
import re
from datetime import datetime, timezone
from typing import Literal

from app.models import ActivityIn, PreferencesIn, ReasonOut

EARTH_RADIUS_KM = 6371.0

DAY_MAP = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]

SkillResult = Literal["fit", "unknown", "mismatch"]
ScheduleResult = Literal["fit", "unknown", "mismatch"]


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    to_rad = math.radians
    d_lat = to_rad(lat2 - lat1)
    d_lng = to_rad(lng2 - lng1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(to_rad(lat1))
        * math.cos(to_rad(lat2))
        * math.sin(d_lng / 2) ** 2
    )
    return 2 * EARTH_RADIUS_KM * math.asin(min(1.0, math.sqrt(a)))


def infer_skill(label: str | None) -> str | None:
    if not label or not label.strip():
        return None
    t = label.lower()
    if re.search(r"beginner|easy|casual|all paces|open to all|friendly|intro", t):
        return "beginner"
    if re.search(r"advanced|expert|hard|strenuous|difficult", t):
        return "advanced"
    if re.search(r"intermediate|moderate|challenging", t):
        return "intermediate"
    return None


def skill_compatible(preference: str, inferred: str | None) -> SkillResult:
    if preference == "any":
        return "unknown" if inferred is None else "fit"
    if inferred is None:
        return "unknown"
    if preference == inferred:
        return "fit"
    if preference == "beginner" and inferred != "beginner":
        return "mismatch"
    if preference == "intermediate" and inferred == "advanced":
        return "mismatch"
    if preference == "advanced":
        return "fit" if inferred == "advanced" else "mismatch"
    return "fit"


def _parse_iso(iso: str | None) -> datetime | None:
    if not iso or not iso.strip():
        return None
    try:
        text = iso.strip().replace("Z", "+00:00")
        dt = datetime.fromisoformat(text)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except ValueError:
        return None


def schedule_fit(
    starts_at: str | None,
    available_days: list[str],
    start_hour: int,
    end_hour: int,
) -> ScheduleResult:
    dt = _parse_iso(starts_at)
    if dt is None:
        return "unknown"
    # Match TS getUTCDay: Sun=0 … Sat=6 (Python weekday is Mon=0 … Sun=6).
    js_day = (dt.weekday() + 1) % 7
    day = DAY_MAP[js_day]
    hour = dt.hour

    if available_days and day not in available_days:
        return "mismatch"
    if start_hour == end_hour:
        return "fit"
    if start_hour < end_hour:
        return "fit" if start_hour <= hour < end_hour else "mismatch"
    return "fit" if hour >= start_hour or hour < end_hour else "mismatch"


def evaluate_constraints(
    activity: ActivityIn,
    preferences: PreferencesIn,
) -> tuple[bool, str | None, list[ReasonOut]]:
    """
    Returns (excluded, exclusion_reason, soft_reasons).
    Hard exclude only when preference + activity data can evaluate reliably.
    """
    reasons: list[ReasonOut] = []
    excluded = False
    exclusion_reason: str | None = None

    # Category interest (soft signal for explanations; model also uses text)
    if preferences.preferred_categories:
        cat = str(activity.category)
        if cat in preferences.preferred_categories:
            reasons.append(
                ReasonOut(
                    code="interest_match",
                    label=f"Matches your interest in {cat}",
                )
            )

    # Budget
    if preferences.max_budget_cents is not None:
        if activity.cost_cents is None:
            reasons.append(
                ReasonOut(
                    code="budget_unknown",
                    label="Cost unknown — not counted as a budget match",
                )
            )
        elif activity.cost_cents > preferences.max_budget_cents:
            excluded = True
            exclusion_reason = (
                f"Costs ${activity.cost_cents / 100:.0f} over your "
                f"${preferences.max_budget_cents / 100:.0f} max"
            )
        else:
            reasons.append(
                ReasonOut(
                    code="within_budget",
                    label=(
                        f"Within your ${preferences.max_budget_cents / 100:.0f} budget"
                    ),
                )
            )

    # Distance
    sp = preferences.starting_point
    if sp is None:
        reasons.append(
            ReasonOut(
                code="distance_unknown",
                label="No starting location set — distance not scored",
            )
        )
    elif activity.latitude is None or activity.longitude is None:
        reasons.append(
            ReasonOut(
                code="distance_unknown",
                label="Activity coordinates unknown — distance not verified",
            )
        )
    else:
        km = haversine_km(sp.lat, sp.lng, activity.latitude, activity.longitude)
        if km > preferences.max_distance_km:
            excluded = True
            exclusion_reason = (
                f"{km:.1f} km away exceeds your {preferences.max_distance_km:g} km limit"
            )
        else:
            reasons.append(
                ReasonOut(
                    code="within_distance",
                    label=f"{km:.1f} km from your starting point",
                )
            )

    # Schedule
    sched = schedule_fit(
        activity.starts_at,
        list(preferences.available_days),
        preferences.time_window.start_hour,
        preferences.time_window.end_hour,
    )
    if sched == "mismatch":
        excluded = True
        exclusion_reason = (
            exclusion_reason
            or "Outside your available days or time window"
        )
    elif sched == "fit":
        reasons.append(
            ReasonOut(code="schedule_fit", label="Fits your available days/times")
        )
    else:
        reasons.append(
            ReasonOut(
                code="schedule_unknown",
                label="Schedule could not be verified against your availability",
            )
        )

    # Skill
    inferred = infer_skill(activity.difficulty_label)
    skill = skill_compatible(preferences.skill_preference, inferred)
    if skill == "mismatch":
        excluded = True
        exclusion_reason = (
            exclusion_reason
            or f"Skill level ({activity.difficulty_label}) does not match your preference"
        )
    elif skill == "fit":
        reasons.append(
            ReasonOut(
                code="skill_fit",
                label=f"Skill fit: {activity.difficulty_label}",
            )
        )
    else:
        reasons.append(
            ReasonOut(
                code="skill_unknown",
                label="Skill level unclear from listing — not counted as a match",
            )
        )

    return excluded, exclusion_reason, reasons
