/**
 * Rank real PlaceEntity venues for a community post.
 * Activity-first: exact sport/club/court, then labeled similar alternatives.
 * Never invents venues; never claims open/bookable/suitable.
 */

import {
  activityMatchInText,
  hasVenueCue,
  matchedRelatedLabel,
  normalizeActivityLabel,
} from "@/lib/community/activity-affinity";
import { isNearPostLocality } from "@/lib/community/location-match";
import { dedupeMapEntities } from "@/lib/data/dedupe-entities";
import type { PostMatchQuery } from "@/lib/community/post-to-preferences";
import type { PostPlaceRecommendation } from "@/types/community-recommendations";
import type { PlaceEntity } from "@/types/map-entities";
import type { RecommendationReason } from "@/types/recommendations";

const AVAILABILITY_NOTE =
  "Catalog venue only — hours, booking, and suitability are not verified.";

function textHay(place: PlaceEntity): string {
  return `${place.name} ${place.summary} ${place.locationLabel}`.toLowerCase();
}

export function scorePlaceForPost(
  place: PlaceEntity,
  query: PostMatchQuery,
  options?: { allowRelated?: boolean },
): PostPlaceRecommendation | null {
  const allowRelated = options?.allowRelated ?? true;
  const reasons: RecommendationReason[] = [];
  let score = 0;
  const hay = textHay(place);
  const activity = normalizeActivityLabel(query.activity);
  const match = activityMatchInText(hay, activity);

  if (activity) {
    if (match === "exact") {
      score += 70;
      reasons.push({
        code: "text_relevance",
        label: `Mentions ${activity} (matches your post)`,
      });
      if (hasVenueCue(hay)) {
        score += 15;
        reasons.push({
          code: "venue_cue",
          label: "Listing looks like a court, club, or recreation venue",
        });
      }
    } else if (match === "related" && allowRelated) {
      const related = matchedRelatedLabel(hay, activity) ?? "a related activity";
      score += 35;
      reasons.push({
        code: "similar_activity",
        label: `No exact ${activity} listing here — similar option: ${related}`,
      });
      if (hasVenueCue(hay)) {
        score += 10;
        reasons.push({
          code: "venue_cue",
          label: "Court/club-style venue for a related racket or field sport",
        });
      }
    } else {
      // Specific activity asked — do not accept bare "sports" category fillers.
      return null;
    }
  } else if (query.category && place.category === query.category) {
    score += 30;
    reasons.push({
      code: "interest_match",
      label: `Same category as your post (${place.category})`,
    });
  } else {
    return null;
  }

  const locality = isNearPostLocality({
    coordinates: place.coordinates,
    locationText: hay,
    city: query.city,
    searchCenter: query.searchCenter,
    radiusKm: query.radiusKm,
  });
  if (!locality.ok) return null;
  if (locality.km != null) {
    const radius = query.radiusKm ?? 35;
    const proximity = 1 - Math.min(1, locality.km / Math.max(radius, 0.001));
    score += 20 * proximity;
  } else if (locality.sameCityLabel) {
    score += 12;
  }
  if (locality.reason) {
    reasons.push({
      code: locality.sameCityLabel ? "same_city" : "within_distance",
      label: locality.reason,
    });
  }

  if (score <= 0) return null;

  return {
    id: place.id,
    kind: "venue",
    name: place.name,
    summary: place.summary,
    category: place.category,
    locationLabel: place.locationLabel,
    coordinates: place.coordinates,
    sourceUrl: null,
    provenance: place.provenance,
    score: Math.round(score * 100) / 100,
    reasons,
    availabilityNote: AVAILABILITY_NOTE,
  };
}

export function recommendVenuesForPost(
  places: PlaceEntity[],
  query: PostMatchQuery,
  limit = 8,
): {
  items: PostPlaceRecommendation[];
  emptyReason: string | null;
} {
  const unique = dedupeMapEntities(places).filter(
    (e): e is PlaceEntity => e.kind === "place",
  );

  const exact = unique
    .map((p) => scorePlaceForPost(p, query, { allowRelated: false }))
    .filter((x): x is PostPlaceRecommendation => x != null)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  const items = [...exact];
  if (items.length < limit && query.activity) {
    const related = unique
      .map((p) => scorePlaceForPost(p, query, { allowRelated: true }))
      .filter((x): x is PostPlaceRecommendation => x != null)
      .filter((x) => !items.some((e) => e.id === x.id))
      .filter((x) => x.reasons.some((r) => r.code === "similar_activity"))
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    items.push(...related.slice(0, limit - items.length));
  }

  const sliced = items.slice(0, limit);
  const activity = normalizeActivityLabel(query.activity);

  return {
    items: sliced,
    emptyReason:
      sliced.length === 0
        ? activity
          ? `No venues near ${query.city ?? "this post"} mention ${activity} (or a close alternative). Far-away listings are hidden.`
          : "No catalog venues matched this post’s activity/location. Nothing was invented to fill the list."
        : null,
  };
}
