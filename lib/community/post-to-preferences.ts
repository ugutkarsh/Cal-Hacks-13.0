/**
 * Map a confirmed community post's structured fields → UserPreferences
 * for reuse of the existing event recommender.
 */

import type { CommunityPost } from "@/types/community-post";
import type { ActivityCategory, GeoPoint } from "@/types/map-entities";
import type { DayOfWeek, UserPreferences } from "@/types/preferences";

export type PostMatchQuery = {
  activity: string | null;
  category: ActivityCategory | null;
  city: string | null;
  neighborhood: string | null;
  preferredDays: DayOfWeek[];
  timeStartHour: number | null;
  timeEndHour: number | null;
  skillLevel: UserPreferences["skillPreference"] | null;
  budgetCents: number | null;
  radiusKm: number | null;
  intent: CommunityPost["intent"];
  searchCenter: GeoPoint | null;
  /** Free-text query for TF-IDF / keyword boost (activity + message snippet). */
  interestText: string;
};

export function communityPostToMatchQuery(
  post: CommunityPost,
  searchCenter: GeoPoint | null,
): PostMatchQuery {
  const activity = post.activity?.trim() || null;
  const parts = [
    activity,
    post.category,
    post.city,
    post.message.slice(0, 240),
  ].filter(Boolean);

  return {
    activity,
    category: post.category,
    city: post.city,
    neighborhood: post.neighborhood,
    preferredDays: [...post.preferredDays],
    timeStartHour: post.timeStartHour,
    timeEndHour: post.timeEndHour,
    skillLevel: post.skillLevel,
    budgetCents: post.budgetCents,
    radiusKm: post.radiusKm,
    intent: post.intent,
    searchCenter,
    interestText: parts.join(" "),
  };
}

/** Preferences shape expected by rank.ts / ML client. */
export function matchQueryToUserPreferences(
  query: PostMatchQuery,
): UserPreferences {
  const categories: ActivityCategory[] = [];
  if (query.category) categories.push(query.category);
  // Soft expansion from activity keywords when category missing.
  if (!query.category && query.activity) {
    const a = query.activity.toLowerCase();
    if (/hik/.test(a)) categories.push("hiking");
    else if (/run|jog/.test(a)) categories.push("running");
    else if (/cycl|bike/.test(a)) categories.push("cycling");
    else if (/climb|boulder/.test(a)) categories.push("climbing");
    else if (
      /badminton|pickleball|tennis|soccer|basketball|yoga|sport/.test(a)
    ) {
      categories.push("sports");
    }
  }

  const startHour = query.timeStartHour ?? 0;
  const endHour = query.timeEndHour ?? 23;

  return {
    maxBudgetCents: query.budgetCents, // only when author stated/stored — never invent
    // Keep event rules aligned with post-locality default (~metro).
    maxDistanceKm: query.radiusKm ?? 35,
    availableDays: query.preferredDays,
    timeWindow: { startHour, endHour },
    preferredCategories: categories,
    skillPreference: query.skillLevel ?? "any",
    startingPoint: query.searchCenter,
    startingPointLabel: query.city ?? "",
    locationSource: query.searchCenter ? "manual" : null,
  };
}
