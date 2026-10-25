/**
 * Deterministic weighted recommendation rules — not a trained ML model.
 * Feedback soft-adjusts scores after hard constraints; never overrides them.
 */

import {
  categoryAffinityLabel,
  dismissedActivityIds,
  positiveActivityIds,
  positiveCategories,
} from "@/lib/feedback/signals";
import { distanceKm } from "@/lib/recommendations/geo";
import { scheduleFit } from "@/lib/recommendations/schedule";
import {
  inferSkillFromLabel,
  skillCompatible,
} from "@/lib/recommendations/skill";
import type { FeedbackEvent } from "@/types/feedback";
import type { ActivityCategory, EventEntity } from "@/types/map-entities";
import type { UserPreferences } from "@/types/preferences";
import type {
  RecommendationReason,
  RecommendationResult,
  ScoredRecommendation,
} from "@/types/recommendations";

const WEIGHTS = {
  interest: 35,
  budget: 15,
  distance: 20,
  schedule: 15,
  skill: 10,
  /** Exact activity previously saved/liked — weaker than declared interests. */
  feedback: 5,
  /** Similar category from feedback — weakest soft signal. */
  affinity: 3,
  /** Explicit search box match — soft only; filters already constrain the set. */
  searchIntent: 12,
} as const;

export type RecommendOptions = {
  /** Active map search text — soft boost only; never invents matches outside the candidate set. */
  searchIntent?: string | null;
};

function searchIntentBoost(
  activity: EventEntity,
  searchIntent: string | null | undefined,
): RecommendationReason | null {
  const q = searchIntent?.trim().toLowerCase();
  if (!q || q.length < 2) return null;
  const hay = `${activity.name} ${activity.summary} ${activity.locationLabel} ${activity.category}`.toLowerCase();
  const tokens = q.split(/\s+/).filter((t) => t.length >= 2);
  if (tokens.length === 0) return null;
  const hits = tokens.filter((t) => hay.includes(t));
  if (hits.length === 0) return null;
  return {
    code: "search_intent_match",
    label: `Matches your search (“${hits.slice(0, 3).join(" ")}”)`,
  };
}

function scoreActivity(
  activity: EventEntity,
  preferences: UserPreferences,
  dismissed: Set<string>,
  positives: Set<string>,
  affinityCats: Set<ActivityCategory>,
  searchIntent?: string | null,
): ScoredRecommendation {
  const reasons: RecommendationReason[] = [];
  let score = 0;
  let excluded = false;
  let exclusionReason: string | null = null;

  // --- Dismissed recommendations (soft hide; does not invent matches) ---
  if (dismissed.has(activity.id)) {
    return {
      activity,
      score: 0,
      reasons: [
        {
          code: "dismissed_by_user",
          label: "Hidden because you dismissed this recommendation",
        },
      ],
      excluded: true,
      exclusionReason: "You dismissed this recommendation",
    };
  }

  // --- Interests (soft) — explicit preferred categories ---
  if (preferences.preferredCategories.includes(activity.category)) {
    score += WEIGHTS.interest;
    reasons.push({
      code: "interest_match",
      label: `Matches your interest in ${activity.category}`,
    });
  }

  // --- Budget (hard when known) ---
  if (preferences.maxBudgetCents != null) {
    if (activity.costCents == null) {
      reasons.push({
        code: "budget_unknown",
        label: "Cost unknown — not counted as a budget match",
      });
    } else if (activity.costCents > preferences.maxBudgetCents) {
      excluded = true;
      exclusionReason = `Costs $${(activity.costCents / 100).toFixed(0)} over your $${(preferences.maxBudgetCents / 100).toFixed(0)} max`;
    } else {
      score += WEIGHTS.budget;
      reasons.push({
        code: "within_budget",
        label: `Within your $${(preferences.maxBudgetCents / 100).toFixed(0)} budget`,
      });
    }
  }

  // --- Distance (hard when both locations known) ---
  if (preferences.startingPoint == null) {
    reasons.push({
      code: "distance_unknown",
      label: "No starting location set — distance not scored",
    });
  } else {
    const km = distanceKm(preferences.startingPoint, activity.coordinates);
    if (km > preferences.maxDistanceKm) {
      excluded = true;
      exclusionReason = `${km.toFixed(1)} km away exceeds your ${preferences.maxDistanceKm} km limit`;
    } else {
      const proximity =
        1 - Math.min(1, km / Math.max(preferences.maxDistanceKm, 0.001));
      score += WEIGHTS.distance * proximity;
      reasons.push({
        code: "within_distance",
        label: `${km.toFixed(1)} km from your starting point`,
      });
    }
  }

  // --- Schedule ---
  const sched = scheduleFit(
    activity.startsAt,
    preferences.availableDays,
    preferences.timeWindow,
  );
  if (sched === "mismatch") {
    excluded = true;
    exclusionReason =
      exclusionReason ?? "Outside your available days or time window";
  } else if (sched === "fit") {
    score += WEIGHTS.schedule;
    reasons.push({
      code: "schedule_fit",
      label: "Fits your available days/times",
    });
  } else {
    reasons.push({
      code: "schedule_unknown",
      label: "Schedule could not be verified against your availability",
    });
  }

  // --- Skill ---
  const inferred = inferSkillFromLabel(activity.difficultyLabel);
  const skill = skillCompatible(preferences.skillPreference, inferred);
  if (skill === "mismatch") {
    excluded = true;
    exclusionReason =
      exclusionReason ??
      `Skill level (${activity.difficultyLabel}) does not match your preference`;
  } else if (skill === "fit") {
    score += WEIGHTS.skill;
    reasons.push({
      code: "skill_fit",
      label: `Skill fit: ${activity.difficultyLabel}`,
    });
  } else {
    reasons.push({
      code: "skill_unknown",
      label: "Skill level unclear from listing — not counted as a match",
    });
  }

  // --- Explicit search intent (soft; candidates already filter-constrained) ---
  if (!excluded) {
    const intent = searchIntentBoost(activity, searchIntent);
    if (intent) {
      score += WEIGHTS.searchIntent;
      reasons.push(intent);
    }
  }

  // --- Feedback soft signals (never revive hard exclusions) ---
  if (!excluded && positives.has(activity.id)) {
    score += WEIGHTS.feedback;
    reasons.push({
      code: "prior_positive_feedback",
      label: "You previously saved, liked, joined, or highly rated this activity",
    });
  }

  if (
    !excluded &&
    !positives.has(activity.id) &&
    affinityCats.has(activity.category) &&
    !preferences.preferredCategories.includes(activity.category)
  ) {
    // Affinity only when category was not already an explicit preferred interest
    // (avoids double-counting declared prefs).
    score += WEIGHTS.affinity;
    reasons.push({
      code: "similar_feedback_affinity",
      label: categoryAffinityLabel(activity.category),
    });
  }

  if (excluded) {
    return {
      activity,
      score: 0,
      reasons,
      excluded: true,
      exclusionReason,
    };
  }

  return {
    activity,
    score: Math.round(score * 100) / 100,
    reasons,
    excluded: false,
    exclusionReason: null,
  };
}

export function recommendActivities(
  activities: EventEntity[],
  preferences: UserPreferences,
  history: FeedbackEvent[] = [],
  options: RecommendOptions = {},
): RecommendationResult {
  const dismissed = dismissedActivityIds(history);
  const positives = positiveActivityIds(history);
  const affinityCats = positiveCategories(history);

  const scored = activities.map((a) =>
    scoreActivity(
      a,
      preferences,
      dismissed,
      positives,
      affinityCats,
      options.searchIntent,
    ),
  );
  const excluded = scored.filter((s) => s.excluded);
  const ranked = scored
    .filter((s) => !s.excluded)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.activity.id.localeCompare(b.activity.id);
    });

  const methodNote =
    history.length > 0
      ? "Matched to your interests, schedule, budget, and distance — with soft adjustments from your saves/likes (rules, not a trained model)."
      : "Matched to your interests, schedule, budget, and distance.";

  return {
    ranked,
    excluded,
    method: "deterministic-weighted-rules",
    methodNote,
  };
}

/**
 * Re-apply dismiss + soft feedback boosts onto an existing ranking (e.g. ML).
 * Hard constraints are assumed already applied by the upstream scorer.
 * Explicit preference reasons stay; feedback never invents new catalog rows.
 */
export function applyFeedbackToRecommendationResult(
  result: RecommendationResult,
  history: FeedbackEvent[],
): RecommendationResult {
  if (history.length === 0) return result;

  const dismissed = dismissedActivityIds(history);
  const positives = positiveActivityIds(history);
  const affinityCats = positiveCategories(history);

  const kept: ScoredRecommendation[] = [];
  const newlyExcluded: ScoredRecommendation[] = [];

  for (const row of result.ranked) {
    if (dismissed.has(row.activity.id)) {
      newlyExcluded.push({
        ...row,
        score: 0,
        excluded: true,
        exclusionReason: "You dismissed this recommendation",
        reasons: [
          ...row.reasons.filter((r) => r.code !== "dismissed_by_user"),
          {
            code: "dismissed_by_user",
            label: "Hidden because you dismissed this recommendation",
          },
        ],
      });
      continue;
    }

    let score = row.score;
    const reasons = [...row.reasons];

    if (
      positives.has(row.activity.id) &&
      !reasons.some((r) => r.code === "prior_positive_feedback")
    ) {
      score += WEIGHTS.feedback;
      reasons.push({
        code: "prior_positive_feedback",
        label:
          "You previously saved, liked, joined, or highly rated this activity",
      });
    }

    if (
      !positives.has(row.activity.id) &&
      affinityCats.has(row.activity.category) &&
      !reasons.some(
        (r) =>
          r.code === "similar_feedback_affinity" || r.code === "interest_match",
      )
    ) {
      score += WEIGHTS.affinity;
      reasons.push({
        code: "similar_feedback_affinity",
        label: categoryAffinityLabel(row.activity.category),
      });
    }

    kept.push({
      ...row,
      score: Math.round(score * 100) / 100,
      reasons,
    });
  }

  kept.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.activity.id.localeCompare(b.activity.id);
  });

  return {
    ...result,
    ranked: kept,
    excluded: [...result.excluded, ...newlyExcluded],
    methodNote:
      `${result.methodNote} Soft personalization from your feedback applied with rules (not a trained model).`.trim(),
  };
}

export function recommendationById(
  result: RecommendationResult,
  activityId: string,
): ScoredRecommendation | undefined {
  return (
    result.ranked.find((r) => r.activity.id === activityId) ??
    result.excluded.find((r) => r.activity.id === activityId)
  );
}
