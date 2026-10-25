import type { EventEntity } from "@/types/map-entities";

export type RecommendationReasonCode =
  | "interest_match"
  | "within_budget"
  | "budget_unknown"
  | "within_distance"
  | "distance_unknown"
  | "schedule_fit"
  | "schedule_unknown"
  | "skill_fit"
  | "skill_unknown"
  | "prior_positive_feedback"
  /** Soft boost from saved/liked similar categories — rules only, not a trained model. */
  | "similar_feedback_affinity"
  /** Hidden because the user dismissed this recommendation. */
  | "dismissed_by_user"
  /** Soft text match to the user's explicit search box (never overrides filters). */
  | "search_intent_match"
  /** Cosine similarity vs declared interests (sklearn TF-IDF). */
  | "text_relevance";

export interface RecommendationReason {
  code: RecommendationReasonCode | string;
  label: string;
}

export interface ScoredRecommendation {
  activity: EventEntity;
  score: number;
  reasons: RecommendationReason[];
  /** True when a hard constraint eliminated the activity. */
  excluded: boolean;
  exclusionReason: string | null;
}

export type RecommendationMethod =
  | "tfidf-cosine"
  | "deterministic-weighted-rules"
  | "rules-fallback";

export interface RecommendationResult {
  ranked: ScoredRecommendation[];
  excluded: ScoredRecommendation[];
  /**
   * `tfidf-cosine` = scikit-learn content-based ML.
   * `deterministic-weighted-rules` = local rules (no Python service).
   * `rules-fallback` = rules used because the ML service was unavailable.
   */
  method: RecommendationMethod;
  methodNote: string;
}
