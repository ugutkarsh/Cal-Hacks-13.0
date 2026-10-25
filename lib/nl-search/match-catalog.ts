/**
 * Rank real MapEntity rows for NL search criteria.
 * Never invents entities — only scores the provided catalog.
 */

import {
  activityMatchInList,
  activityMatchInText,
  matchedRelatedLabel,
  normalizeActivityLabel,
} from "@/lib/community/activity-affinity";
import { isNearPostLocality } from "@/lib/community/location-match";
import { dayOfWeekFromIso, hourFromIso } from "@/lib/recommendations/schedule";
import {
  inferSkillFromLabel,
  skillCompatible,
} from "@/lib/recommendations/skill";
import type {
  EventEntity,
  GeoPoint,
  MapEntity,
  PersonEntity,
  PlaceEntity,
} from "@/types/map-entities";
import type { NlSearchCriteria, NlSearchMatch } from "@/types/nl-search";
import type { RecommendationReason } from "@/types/recommendations";

function hay(entity: MapEntity): string {
  if (entity.kind === "person") {
    return `${entity.name} ${entity.summary} ${entity.bio} ${entity.locationLabel} ${entity.interests.join(" ")}`;
  }
  if (entity.kind === "place") {
    return `${entity.name} ${entity.summary} ${entity.locationLabel} ${entity.amenities.join(" ")}`;
  }
  return `${entity.name} ${entity.summary} ${entity.locationLabel}`;
}

function localityOk(
  entity: MapEntity,
  criteria: NlSearchCriteria,
  searchCenter: GeoPoint | null,
): { ok: boolean; reason: string | null } {
  if (!criteria.city && !searchCenter) {
    return { ok: true, reason: null };
  }
  const check = isNearPostLocality({
    coordinates: entity.coordinates,
    locationText: hay(entity),
    city: criteria.city,
    searchCenter,
    radiusKm: criteria.useNearMe || searchCenter ? 40 : null,
  });
  return { ok: check.ok, reason: check.reason };
}

function scoreEvent(
  event: EventEntity,
  criteria: NlSearchCriteria,
  searchCenter: GeoPoint | null,
): NlSearchMatch | null {
  const reasons: RecommendationReason[] = [];
  let score = 10;
  const text = hay(event);

  const loc = localityOk(event, criteria, searchCenter);
  if (!loc.ok) return null;
  if (loc.reason) {
    reasons.push({ code: "within_distance", label: loc.reason });
    score += 8;
  }

  const activity = normalizeActivityLabel(criteria.activity);
  if (activity) {
    const match = activityMatchInText(text, activity);
    if (match === "exact") {
      score += 50;
      reasons.push({
        code: "text_relevance",
        label: `Mentions ${activity} in “${event.name}” / summary`,
      });
    } else if (match === "related") {
      const related = matchedRelatedLabel(text, activity) ?? "related activity";
      score += 18;
      reasons.push({
        code: "similar_activity",
        label: `Similar to ${activity}: ${related}`,
      });
    } else {
      // Named activity must appear (exact/related) — never invent via bare category.
      return null;
    }
  } else if (criteria.category) {
    if (event.category !== criteria.category) return null;
    score += 20;
    reasons.push({
      code: "interest_match",
      label: `Category ${event.category}`,
    });
  }

  if (criteria.preferredDays.length > 0) {
    const day = dayOfWeekFromIso(event.startsAt);
    if (day && criteria.preferredDays.includes(day)) {
      score += 15;
      reasons.push({
        code: "schedule_fit",
        label: `Starts on ${day.toUpperCase()} (matches preferred days)`,
      });
    } else if (day) {
      // Soft penalty — keep if strong activity match
      score -= 8;
      reasons.push({
        code: "schedule_fit",
        label: `Starts on ${day.toUpperCase()} — outside preferred days`,
      });
    }
  }

  if (criteria.timeStartHour != null || criteria.timeEndHour != null) {
    const hour = hourFromIso(event.startsAt);
    const start = criteria.timeStartHour ?? 0;
    const end = criteria.timeEndHour ?? 24;
    if (hour != null) {
      const inWindow =
        start <= end ? hour >= start && hour < end : hour >= start || hour < end;
      if (inWindow) {
        score += 10;
        reasons.push({
          code: "schedule_fit",
          label: `Starts around ${hour}:00 UTC window vs your ${start}–${end} local preference`,
        });
      }
    }
  }

  if (criteria.skillLevel && criteria.skillLevel !== "any") {
    const inferred = inferSkillFromLabel(event.difficultyLabel);
    const fit = skillCompatible(criteria.skillLevel, inferred);
    if (fit === "mismatch") return null;
    if (fit === "fit") {
      score += 12;
      reasons.push({
        code: "skill_fit",
        label: `Skill “${event.difficultyLabel}” fits ${criteria.skillLevel}`,
      });
    }
  }

  if (criteria.budgetCents != null) {
    if (event.costCents == null) {
      reasons.push({
        code: "within_budget",
        label: "Cost unknown on listing — not treated as within budget",
      });
    } else if (event.costCents <= criteria.budgetCents) {
      score += 10;
      reasons.push({
        code: "within_budget",
        label: `Listed cost $${(event.costCents / 100).toFixed(0)} ≤ budget`,
      });
    } else {
      return null;
    }
  }

  if (reasons.length === 0) {
    reasons.push({
      code: "text_relevance",
      label: "Included from catalog with open kinds filter",
    });
  }

  return {
    id: event.id,
    kind: "event",
    name: event.name,
    summary: event.summary,
    category: event.category,
    locationLabel: event.locationLabel,
    coordinates: event.coordinates,
    score: Math.round(score * 100) / 100,
    reasons,
  };
}

function scorePlace(
  place: PlaceEntity,
  criteria: NlSearchCriteria,
  searchCenter: GeoPoint | null,
): NlSearchMatch | null {
  const reasons: RecommendationReason[] = [];
  let score = 8;
  const text = hay(place);

  const loc = localityOk(place, criteria, searchCenter);
  if (!loc.ok) return null;
  if (loc.reason) {
    reasons.push({ code: "within_distance", label: loc.reason });
    score += 8;
  }

  const activity = normalizeActivityLabel(criteria.activity);
  if (activity) {
    const match = activityMatchInText(text, activity);
    if (match === "exact") {
      score += 45;
      reasons.push({
        code: "text_relevance",
        label: `Place mentions ${activity}`,
      });
    } else if (match === "related") {
      score += 16;
      reasons.push({
        code: "similar_activity",
        label: `Related to ${activity}`,
      });
    } else {
      return null;
    }
  } else if (criteria.category) {
    if (place.category !== criteria.category) return null;
    score += 18;
    reasons.push({
      code: "interest_match",
      label: `Category ${place.category}`,
    });
  }

  return {
    id: place.id,
    kind: "place",
    name: place.name,
    summary: place.summary,
    category: place.category,
    locationLabel: place.locationLabel,
    coordinates: place.coordinates,
    score: Math.round(score * 100) / 100,
    reasons:
      reasons.length > 0
        ? reasons
        : [{ code: "text_relevance", label: "Place in catalog" }],
  };
}

function scorePerson(
  person: PersonEntity,
  criteria: NlSearchCriteria,
  searchCenter: GeoPoint | null,
): NlSearchMatch | null {
  const reasons: RecommendationReason[] = [];
  let score = 8;
  const text = hay(person);

  const loc = localityOk(person, criteria, searchCenter);
  if (!loc.ok) return null;
  if (loc.reason) {
    reasons.push({ code: "within_distance", label: loc.reason });
    score += 6;
  }

  const activity = normalizeActivityLabel(criteria.activity);
  if (activity) {
    const inInterests = activityMatchInList(person.interests, activity);
    const inText = activityMatchInText(text, activity);
    if (inInterests === "exact" || inText === "exact") {
      score += 48;
      reasons.push({
        code: "interest_match",
        label: `Profile interests / bio mention ${activity}`,
      });
    } else if (inInterests === "related" || inText === "related") {
      score += 16;
      reasons.push({
        code: "similar_activity",
        label: `Related interest to ${activity}`,
      });
    } else {
      return null;
    }
  } else if (criteria.category) {
    if (
      person.category !== criteria.category &&
      !person.interests.includes(criteria.category)
    ) {
      return null;
    }
    score += 16;
    reasons.push({
      code: "interest_match",
      label: `Interest category ${criteria.category}`,
    });
  }

  reasons.push({
    code: "text_relevance",
    label: "Discoverable profile only — approximate pin, not live GPS",
  });

  return {
    id: person.id,
    kind: "person",
    name: person.name,
    summary: person.summary,
    category: person.category,
    locationLabel: person.locationLabel,
    coordinates: person.coordinates,
    score: Math.round(score * 100) / 100,
    reasons,
  };
}

/**
 * Match criteria against a real catalog. Returns ranked matches with field-based reasons.
 */
export function matchNlCatalog(
  catalog: MapEntity[],
  criteria: NlSearchCriteria,
  options?: { searchCenter?: GeoPoint | null; limit?: number },
): { matches: NlSearchMatch[]; emptyReason: string | null } {
  const center = options?.searchCenter ?? null;
  const limit = options?.limit ?? 24;
  const kinds = new Set(criteria.kinds);
  const scored: NlSearchMatch[] = [];

  for (const entity of catalog) {
    if (!kinds.has(entity.kind)) continue;
    let hit: NlSearchMatch | null = null;
    if (entity.kind === "event") {
      hit = scoreEvent(entity, criteria, center);
    } else if (entity.kind === "place") {
      hit = scorePlace(entity, criteria, center);
    } else {
      hit = scorePerson(entity, criteria, center);
    }
    if (hit) scored.push(hit);
  }

  scored.sort((a, b) => b.score - a.score);
  const matches = scored.slice(0, limit);

  if (matches.length === 0) {
    const bits: string[] = [];
    if (criteria.activity) bits.push(`activity “${criteria.activity}”`);
    if (criteria.city) bits.push(`near “${criteria.city}”`);
    if (criteria.skillLevel) bits.push(`skill ${criteria.skillLevel}`);
    return {
      matches: [],
      emptyReason: bits.length
        ? `No catalog items matched ${bits.join(", ")}. Try broader criteria — nothing was invented.`
        : "No catalog items matched these criteria. Nothing was invented.",
    };
  }

  return { matches, emptyReason: null };
}
