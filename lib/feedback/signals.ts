/**
 * Derive ranking signals from feedback history.
 * Explicit prefs / hard constraints always outrank these soft signals.
 * Not a trained ML model — deterministic rules only.
 */

import type { FeedbackEvent } from "@/types/feedback";
import type { ActivityCategory } from "@/types/map-entities";

const POSITIVE = new Set(["save", "like", "join"]);

/** Latest action per activity id (by createdAt). */
export function latestActionByActivity(
  history: FeedbackEvent[],
): Map<string, FeedbackEvent> {
  const map = new Map<string, FeedbackEvent>();
  const sorted = [...history].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
  for (const e of sorted) {
    map.set(e.activityId, e);
  }
  return map;
}

export function isPositiveEvent(e: FeedbackEvent): boolean {
  if (POSITIVE.has(e.action)) return true;
  return e.action === "rate" && (e.rating ?? 0) >= 4;
}

/** Activity ids whose latest signal is skip/dismiss. */
export function dismissedActivityIds(history: FeedbackEvent[]): Set<string> {
  const latest = latestActionByActivity(history);
  const out = new Set<string>();
  for (const [id, e] of latest) {
    if (e.action === "skip") out.add(id);
  }
  return out;
}

/** Activity ids whose latest signal is positive (save/like/join/high rate). */
export function positiveActivityIds(history: FeedbackEvent[]): Set<string> {
  const latest = latestActionByActivity(history);
  const out = new Set<string>();
  for (const [id, e] of latest) {
    if (isPositiveEvent(e)) out.add(id);
  }
  return out;
}

/**
 * Categories the user positively engaged with (from saved/liked items).
 * Used only for soft similar-activity boosts — never invents personal traits.
 */
export function positiveCategories(
  history: FeedbackEvent[],
): Set<ActivityCategory> {
  const dismissed = dismissedActivityIds(history);
  const cats = new Set<ActivityCategory>();
  for (const e of history) {
    if (dismissed.has(e.activityId)) continue;
    if (!isPositiveEvent(e)) continue;
    const c = e.activityCategory;
    if (
      c === "hiking" ||
      c === "cycling" ||
      c === "running" ||
      c === "outdoor" ||
      c === "meetup" ||
      c === "climbing" ||
      c === "sports" ||
      c === "other"
    ) {
      cats.add(c);
    }
  }
  return cats;
}

export function categoryAffinityLabel(category: ActivityCategory): string {
  const outdoorish = new Set(["hiking", "outdoor", "running", "cycling"]);
  if (outdoorish.has(category)) {
    return "Recommended because you saved similar outdoor activities";
  }
  if (category === "sports") {
    return "Recommended because you saved similar sports activities";
  }
  return `Recommended because you saved similar ${category} activities`;
}
