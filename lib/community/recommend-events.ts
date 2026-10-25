/**
 * Rank real EventEntity rows for a community post.
 * Activity-first (exact → labeled similar). Bare category is not enough when
 * the post names a specific sport.
 */

import {
  activityMatchInText,
  matchedRelatedLabel,
  normalizeActivityLabel,
} from "@/lib/community/activity-affinity";
import { isNearPostLocality } from "@/lib/community/location-match";
import { dedupeMapEntities } from "@/lib/data/dedupe-entities";
import {
  matchQueryToUserPreferences,
  type PostMatchQuery,
} from "@/lib/community/post-to-preferences";
import {
  fetchMlRecommendations,
  getRecommenderUrl,
} from "@/lib/recommendations/ml-client";
import { recommendActivities } from "@/lib/recommendations/rank";
import type { PostPlaceRecommendation } from "@/types/community-recommendations";
import type { EventEntity } from "@/types/map-entities";
import type {
  RecommendationMethod,
  RecommendationReason,
} from "@/types/recommendations";

const EVENT_AVAILABILITY_NOTE =
  "Imported or catalog event — registration status may change; not a guarantee of open spots.";

function eventHay(event: EventEntity): string {
  return `${event.name} ${event.summary} ${event.locationLabel}`;
}

function eventToPlaceRec(
  event: EventEntity,
  score: number,
  reasons: RecommendationReason[],
): PostPlaceRecommendation {
  return {
    id: event.id,
    kind: "event",
    name: event.name,
    summary: event.summary,
    category: event.category,
    locationLabel: event.locationLabel,
    coordinates: event.coordinates,
    sourceUrl: event.sourceUrl,
    provenance: event.provenance,
    score,
    reasons,
    availabilityNote: EVENT_AVAILABILITY_NOTE,
  };
}

function scoreEventForActivity(
  event: EventEntity,
  query: PostMatchQuery,
  baseScore: number,
  baseReasons: RecommendationReason[],
  allowRelated: boolean,
): PostPlaceRecommendation | null {
  const activity = normalizeActivityLabel(query.activity);
  const reasons = [...baseReasons];
  let score = baseScore;
  const hay = eventHay(event);

  const locality = isNearPostLocality({
    coordinates: event.coordinates,
    locationText: hay,
    city: query.city,
    searchCenter: query.searchCenter,
    radiusKm: query.radiusKm,
  });
  if (!locality.ok) return null;
  if (locality.reason) {
    reasons.push({
      code: locality.sameCityLabel ? "same_city" : "within_distance",
      label: locality.reason,
    });
  }
  if (locality.sameCityLabel) score += 12;

  if (activity) {
    const match = activityMatchInText(hay, activity);
    if (match === "exact") {
      score += 50;
      reasons.push({
        code: "text_relevance",
        label: `Event mentions ${activity} (matches your post)`,
      });
    } else if (match === "related" && allowRelated) {
      const related = matchedRelatedLabel(hay, activity) ?? "a related activity";
      score += 22;
      reasons.push({
        code: "similar_activity",
        label: `No exact ${activity} event — similar: ${related}`,
      });
    } else {
      return null;
    }
  }

  return eventToPlaceRec(event, Math.round(score * 100) / 100, reasons);
}

export async function recommendEventsForPost(
  events: EventEntity[],
  query: PostMatchQuery,
  limit = 8,
): Promise<{
  items: PostPlaceRecommendation[];
  method: RecommendationMethod;
  methodNote: string;
  emptyReason: string | null;
  sklearnUsed: boolean;
}> {
  const unique = dedupeMapEntities(events).filter(
    (e): e is EventEntity => e.kind === "event",
  );
  const prefs = matchQueryToUserPreferences(query);
  const recommenderUrl = getRecommenderUrl();
  const activity = normalizeActivityLabel(query.activity);

  let method: RecommendationMethod = "deterministic-weighted-rules";
  let methodNote =
    "Matched to this post’s activity, schedule, and distance.";
  let sklearnUsed = false;

  // Base ranking (distance/schedule/etc.) — activity filter applied after.
  let ranked = recommendActivities(unique, prefs, []).ranked;

  if (recommenderUrl && unique.length > 0) {
    try {
      const ml = await fetchMlRecommendations({
        preferences: prefs,
        events: unique,
        limit: Math.max(limit * 5, 40),
      });
      if (ml && ml.method === "tfidf-cosine") {
        ranked = ml.ranked;
        method = "tfidf-cosine";
        methodNote =
          "Ranked from your interests, schedule, and distance.";
        sklearnUsed = true;
      } else if (ml) {
        ranked = ml.ranked;
        method = ml.method;
        methodNote =
          "Matched to this post’s activity, schedule, and distance.";
      } else {
        method = "rules-fallback";
        methodNote =
          "Matched to this post’s activity, schedule, and distance.";
      }
    } catch {
      method = "rules-fallback";
      methodNote =
        "Matched to this post’s activity, schedule, and distance.";
      ranked = recommendActivities(unique, prefs, []).ranked;
      sklearnUsed = false;
    }
  }

  // Re-add local activity hits that rules/ML soft-excluded — never far-away cities.
  const byId = new Map(unique.map((e) => [e.id, e]));
  for (const event of unique) {
    if (ranked.some((r) => r.activity.id === event.id)) continue;
    if (!activity) continue;
    if (activityMatchInText(eventHay(event), activity) === "none") continue;
    const local = isNearPostLocality({
      coordinates: event.coordinates,
      locationText: eventHay(event),
      city: query.city,
      searchCenter: query.searchCenter,
      radiusKm: query.radiusKm,
    });
    if (!local.ok) continue;
    ranked.push({
      activity: event,
      score: 10,
      reasons: [],
      excluded: false,
      exclusionReason: null,
    });
  }

  const exact: PostPlaceRecommendation[] = [];
  const related: PostPlaceRecommendation[] = [];

  for (const row of ranked) {
    if (row.excluded && activityMatchInText(eventHay(row.activity), activity) === "none") {
      continue;
    }
    const exactHit = scoreEventForActivity(
      row.activity,
      query,
      row.score,
      row.reasons,
      false,
    );
    if (exactHit) {
      exact.push(exactHit);
      continue;
    }
    const relatedHit = scoreEventForActivity(
      byId.get(row.activity.id) ?? row.activity,
      query,
      row.score,
      row.reasons,
      true,
    );
    if (relatedHit?.reasons.some((r) => r.code === "similar_activity")) {
      related.push(relatedHit);
    }
  }

  exact.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  related.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  const items = [...exact];
  if (items.length < limit) {
    for (const r of related) {
      if (items.some((i) => i.id === r.id)) continue;
      items.push(r);
      if (items.length >= limit) break;
    }
  }

  return {
    items: items.slice(0, limit),
    method,
    methodNote,
    emptyReason:
      items.length === 0
        ? activity
          ? `No nearby catalog events mention ${activity} (or a close alternative) around ${query.city ?? "this post’s city"}. Far-away matches are hidden.`
          : "No nearby catalog events matched this post. Empty results are shown rather than inventing listings."
        : null,
    sklearnUsed,
  };
}
