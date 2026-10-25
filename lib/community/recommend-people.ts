/**
 * Deterministic people matching for community posts.
 * Discoverable profiles only; fuzzed coords; evidence-based reasons.
 */

import {
  activityMatchInList,
  activityMatchInText,
  matchedRelatedLabel,
  normalizeActivityLabel,
} from "@/lib/community/activity-affinity";
import {
  cityNeedle,
  isNearPostLocality,
} from "@/lib/community/location-match";
import { skillCompatible } from "@/lib/recommendations/skill";
import type { PostMatchQuery } from "@/lib/community/post-to-preferences";
import type { PostPeopleRecommendation } from "@/types/community-recommendations";
import type { RecommendationReason } from "@/types/recommendations";
import type { DayOfWeek, SkillPreference } from "@/types/preferences";

export type PeopleMatchCandidate = {
  id: string;
  displayName: string;
  bio: string | null;
  city: string | null;
  neighborhood: string | null;
  interests: string[];
  skillLevel: SkillPreference | null;
  availabilityDays: DayOfWeek[];
  availabilityStartHour: number | null;
  availabilityEndHour: number | null;
  preferredRadiusKm: number | null;
  discoveryLat: number;
  discoveryLng: number;
  discoverable: boolean;
  acceptsMessages: boolean;
  /** True only when backed by an active open looking post. */
  activelyLooking: boolean;
  activelyLookingNote: string | null;
  /** Activity on their open looking post, when present. */
  lookingActivity: string | null;
};

export function daysOverlap(
  a: DayOfWeek[],
  b: DayOfWeek[],
): DayOfWeek[] {
  if (!a.length || !b.length) return [];
  return a.filter((d) => b.includes(d));
}

/** Inclusive start, exclusive end when start < end; overnight supported. */
export function hoursOverlap(
  aStart: number | null,
  aEnd: number | null,
  bStart: number | null,
  bEnd: number | null,
): boolean {
  if (
    aStart == null ||
    aEnd == null ||
    bStart == null ||
    bEnd == null
  ) {
    return false;
  }
  const inWindow = (h: number, s: number, e: number) => {
    if (s === e) return true;
    if (s < e) return h >= s && h < e;
    return h >= s || h < e;
  };
  // Sample hours in A's window and see if any fall in B (coarse).
  for (let h = 0; h < 24; h++) {
    if (inWindow(h, aStart, aEnd) && inWindow(h, bStart, bEnd)) return true;
  }
  return false;
}

export function scorePersonForPost(
  person: PeopleMatchCandidate,
  query: PostMatchQuery,
  options: { viewerId: string | null; postOwnerId: string },
): PostPeopleRecommendation | null {
  if (!person.discoverable) return null;
  if (person.id === options.postOwnerId) return null;
  if (options.viewerId && person.id === options.viewerId) return null;

  const reasons: RecommendationReason[] = [];
  let score = 0;
  const activity = normalizeActivityLabel(query.activity);
  const bioHay = `${person.bio ?? ""} ${person.interests.join(" ")}`;
  const interestMatch = activityMatchInList(person.interests, activity);
  const bioMatch = activityMatchInText(bioHay, activity);
  const lookingMatch = activityMatchInText(
    person.lookingActivity ?? "",
    activity,
  );
  const bestActivityMatch =
    interestMatch === "exact" ||
    bioMatch === "exact" ||
    lookingMatch === "exact"
      ? "exact"
      : interestMatch === "related" ||
          bioMatch === "related" ||
          lookingMatch === "related"
        ? "related"
        : "none";

  if (activity) {
    if (bestActivityMatch === "exact") {
      score += 50;
      reasons.push({
        code: "shared_interest",
        label:
          lookingMatch === "exact"
            ? `They have an open post about ${activity}`
            : `Both of you are into ${activity}`,
      });
    } else if (bestActivityMatch === "related") {
      const related =
        matchedRelatedLabel(
          `${bioHay} ${person.lookingActivity ?? ""}`,
          activity,
        ) ?? "a related activity";
      score += 28;
      reasons.push({
        code: "similar_activity",
        label: `They are into ${related} — close to your ${activity} ask`,
      });
    } else {
      // Specific sport asked — don't recommend people only for generic "sports".
      return null;
    }
  } else if (query.category) {
    const interestsLower = person.interests.map((i) => i.toLowerCase());
    if (interestsLower.includes(query.category)) {
      score += 25;
      reasons.push({
        code: "shared_interest",
        label: `Shared interest category: ${query.category}`,
      });
    }
  }

  const hasPin =
    Number.isFinite(person.discoveryLat) &&
    Number.isFinite(person.discoveryLng);
  const locality = isNearPostLocality({
    coordinates: hasPin
      ? { lat: person.discoveryLat, lng: person.discoveryLng }
      : null,
    locationText: `${person.city ?? ""} ${person.neighborhood ?? ""}`,
    city: query.city,
    searchCenter: query.searchCenter,
    radiusKm: query.radiusKm ?? person.preferredRadiusKm,
  });
  if (!locality.ok) return null;
  if (locality.sameCityLabel) {
    score += 14;
    reasons.push({
      code: "same_city",
      label: `Same city (${person.city ?? cityNeedle(query.city)})`,
    });
  } else if (locality.reason) {
    reasons.push({
      code: "within_distance",
      label: locality.reason,
    });
  }

  const dayHits = daysOverlap(query.preferredDays, person.availabilityDays);
  if (dayHits.length > 0) {
    score += 20;
    reasons.push({
      code: "schedule_overlap",
      label: `Overlapping days: ${dayHits.join(", ")}`,
    });
  }

  if (
    hoursOverlap(
      query.timeStartHour,
      query.timeEndHour,
      person.availabilityStartHour,
      person.availabilityEndHour,
    )
  ) {
    score += 15;
    reasons.push({
      code: "schedule_overlap",
      label: "Your selected time windows overlap",
    });
  } else if (
    query.timeStartHour != null &&
    person.availabilityStartHour == null
  ) {
    reasons.push({
      code: "schedule_unknown",
      label: "They have not shared specific hours — time overlap unknown",
    });
  }

  if (query.skillLevel && query.skillLevel !== "any" && person.skillLevel) {
    const theirSkill =
      person.skillLevel === "any" ? null : person.skillLevel;
    const fit = skillCompatible(query.skillLevel, theirSkill);
    if (fit === "mismatch") return null;
    if (fit === "fit") {
      score += 10;
      reasons.push({
        code: "skill_fit",
        label: `Compatible skill preference (${person.skillLevel})`,
      });
    }
  } else if (query.skillLevel && query.skillLevel !== "any") {
    reasons.push({
      code: "skill_unknown",
      label: "Their skill level is not listed — not counted as a match",
    });
  }

  if (locality.km != null) {
    const radius = query.radiusKm ?? 35;
    score += 10 * (1 - Math.min(1, locality.km / Math.max(radius, 0.001)));
  }

  if (person.activelyLooking) {
    score += 12;
    reasons.push({
      code: "active_looking_post",
      label:
        person.activelyLookingNote ??
        "They have an active community post looking for partners or a venue",
    });
  }

  // When a specific activity is set, require an activity (or similar) signal.
  const substantive = reasons.some((r) =>
    ["shared_interest", "similar_activity", "active_looking_post"].includes(
      r.code,
    ),
  );
  if (!substantive || score <= 0) return null;

  return {
    id: person.id,
    displayName: person.displayName,
    bio: person.bio,
    city: person.city,
    neighborhood: person.neighborhood,
    interests: person.interests,
    skillLevel: person.skillLevel,
    discoveryLat: person.discoveryLat,
    discoveryLng: person.discoveryLng,
    acceptsMessages: person.acceptsMessages,
    presenceNote:
      "Approximate discovery pin from their profile — not a live location.",
    score: Math.round(score * 100) / 100,
    reasons,
    activelyLooking: person.activelyLooking,
    activelyLookingNote: person.activelyLookingNote,
  };
}

export function recommendPeopleForPost(
  candidates: PeopleMatchCandidate[],
  query: PostMatchQuery,
  options: { viewerId: string | null; postOwnerId: string; limit?: number },
): {
  items: PostPeopleRecommendation[];
  emptyReason: string | null;
} {
  const limit = options.limit ?? 8;
  const items = candidates
    .map((c) => scorePersonForPost(c, query, options))
    .filter((x): x is PostPeopleRecommendation => x != null)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, limit);

  return {
    items,
    emptyReason:
      items.length === 0
        ? query.activity
          ? `No discoverable people near ${query.city ?? "this post"} list ${query.activity} (or a close alternative). Hidden/private profiles are never shown.`
          : "No discoverable profiles matched shared interests or availability near this post. Hidden/private profiles are never shown."
        : null,
  };
}
