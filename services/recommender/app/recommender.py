"""
Content-based recommender: scikit-learn TfidfVectorizer + cosine similarity.

This is a real sklearn feature pipeline. It is NOT a trained predictive model
that learns from user outcomes over time.
"""

from __future__ import annotations

import re

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from app.constraints import evaluate_constraints
from app.models import (
    ActivityIn,
    PreferencesIn,
    RankedItemOut,
    ReasonOut,
    RecommendRequest,
    RecommendResponse,
)

METHOD_NOTE = (
    "Content-based ML: scikit-learn TfidfVectorizer + cosine similarity over "
    "activity title/description/category vs your declared interests. Hard "
    "budget/distance/schedule/skill filters are applied separately when data "
    "exists. Relevance scores are text similarity, not predicted enjoyment."
)


def normalize_text(value: str | None) -> str:
    if not value:
        return ""
    text = value.lower()
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"[^a-z0-9\s]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def activity_document(activity: ActivityIn) -> str:
    parts = [
        activity.title,
        activity.description or "",
        str(activity.category or ""),
        activity.difficulty_label or "",
    ]
    doc = normalize_text(" ".join(parts))
    return doc if doc else "activity"


def preference_query(preferences: PreferencesIn) -> str:
    parts: list[str] = []
    for cat in preferences.preferred_categories:
        parts.append(str(cat))
        # Expand short category tokens so TF-IDF has more signal
        if cat == "hiking":
            parts.extend(["hike", "trail", "outdoors"])
        elif cat == "cycling":
            parts.extend(["bike", "bicycle", "ride"])
        elif cat == "running":
            parts.extend(["run", "jog", "5k", "race"])
        elif cat == "climbing":
            parts.extend(["climb", "boulder", "gym"])
        elif cat == "sports":
            parts.extend(
                [
                    "sports",
                    "fitness",
                    "volleyball",
                    "badminton",
                    "pickleball",
                    "gym",
                ]
            )
        elif cat == "outdoor":
            parts.extend(["outdoor", "park", "nature"])
        elif cat == "meetup":
            parts.extend(["meetup", "social", "group"])
    if preferences.interest_text:
        parts.append(preferences.interest_text)
    if preferences.skill_preference and preferences.skill_preference != "any":
        parts.append(preferences.skill_preference)
    query = normalize_text(" ".join(parts))
    return query if query else "activities events outdoors"


def rank_activities(request: RecommendRequest) -> RecommendResponse:
    prefs = request.preferences
    activities = request.activities

    if not activities:
        return RecommendResponse(
            method_note=METHOD_NOTE,
            ranked=[],
            excluded=[],
            catalog_size=0,
            candidate_size=0,
        )

    candidates: list[ActivityIn] = []
    excluded_items: list[RankedItemOut] = []
    soft_reasons: dict[str, list[ReasonOut]] = {}

    for activity in activities:
        excluded, exclusion_reason, reasons = evaluate_constraints(
            activity, prefs
        )
        soft_reasons[activity.id] = reasons
        if excluded:
            excluded_items.append(
                RankedItemOut(
                    activity_id=activity.id,
                    relevance_score=0.0,
                    reasons=reasons,
                    excluded=True,
                    exclusion_reason=exclusion_reason,
                )
            )
        else:
            candidates.append(activity)

    if not candidates:
        return RecommendResponse(
            method_note=METHOD_NOTE,
            ranked=[],
            excluded=excluded_items,
            catalog_size=len(activities),
            candidate_size=0,
        )

    docs = [activity_document(a) for a in candidates]
    query = preference_query(prefs)

    vectorizer = TfidfVectorizer(
        min_df=1,
        max_df=1.0,
        ngram_range=(1, 2),
        stop_words="english",
        dtype=np.float64,
    )
    # Fit on catalog only so unseen query tokens are ignored safely.
    matrix = vectorizer.fit_transform(docs)
    query_vec = vectorizer.transform([query])
    similarities = cosine_similarity(query_vec, matrix).flatten()

    ranked: list[RankedItemOut] = []
    for activity, sim in zip(candidates, similarities, strict=True):
        score = float(round(max(0.0, min(1.0, float(sim))), 4))
        reasons = list(soft_reasons.get(activity.id, []))
        if score > 0:
            cats = ", ".join(prefs.preferred_categories) or "your interests"
            reasons.insert(
                0,
                ReasonOut(
                    code="text_relevance",
                    label=(
                        f"Text relevance {score:.2f} vs your interests"
                        f" ({cats})"
                    ),
                ),
            )
        else:
            reasons.insert(
                0,
                ReasonOut(
                    code="text_relevance",
                    label=(
                        "Low text overlap with your declared interests "
                        "(still passed hard filters)"
                    ),
                ),
            )
        ranked.append(
            RankedItemOut(
                activity_id=activity.id,
                relevance_score=score,
                reasons=reasons,
                excluded=False,
                exclusion_reason=None,
            )
        )

    ranked.sort(
        key=lambda item: (-item.relevance_score, item.activity_id),
    )
    limit = request.limit
    return RecommendResponse(
        method_note=METHOD_NOTE,
        ranked=ranked[:limit],
        excluded=excluded_items,
        catalog_size=len(activities),
        candidate_size=len(candidates),
    )
