/**
 * Viewer ↔ peer teammate compatibility (discoverable profiles only).
 */

import type { RecommendationReason } from "@/types/recommendations";
import type { DayOfWeek, SkillPreference } from "@/types/preferences";

/** Documented, configurable factor weights (raw points before normalization). */
export type CompatibilityFactorId =
  | "shared_interest"
  | "similar_activity"
  | "schedule_day"
  | "schedule_hour"
  | "skill_fit"
  | "area_proximity";

export type CompatibilityWeights = Record<CompatibilityFactorId, number>;

/**
 * Default weights — missing data skips the factor (not a penalty).
 * Sum of applicable weights is the normalization denominator.
 */
export const DEFAULT_COMPATIBILITY_WEIGHTS: CompatibilityWeights = {
  shared_interest: 40,
  similar_activity: 22,
  schedule_day: 20,
  schedule_hour: 15,
  skill_fit: 12,
  area_proximity: 18,
};

export type CompatibilityViewer = {
  id: string;
  interests: string[];
  skillLevel: SkillPreference | null;
  availabilityDays: DayOfWeek[];
  availabilityStartHour: number | null;
  availabilityEndHour: number | null;
  city: string | null;
  discoveryLat: number | null;
  discoveryLng: number | null;
  preferredRadiusKm: number | null;
};

export type CompatibilityMatch = {
  id: string;
  displayName: string;
  bio: string | null;
  city: string | null;
  neighborhood: string | null;
  interests: string[];
  skillLevel: SkillPreference | null;
  /** Fuzzed pin when share level allows; otherwise null. */
  discoveryLat: number | null;
  discoveryLng: number | null;
  acceptsMessages: boolean;
  presenceNote: string;
  /** 0–100 normalized score from applicable factors only. */
  scorePercent: number;
  /** Raw points earned (debug / tests). */
  rawScore: number;
  /** Max points from factors that had enough data on both sides. */
  rawMax: number;
  reasons: RecommendationReason[];
  sharedInterests: string[];
};

export type CompatibilityResult = {
  method: "deterministic-profile-compatibility";
  methodNote: string;
  viewerId: string;
  weights: CompatibilityWeights;
  matches: CompatibilityMatch[];
  emptyReason: string | null;
};
