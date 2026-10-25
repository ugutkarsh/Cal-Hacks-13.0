/**
 * Explainable viewer↔peer compatibility for shared activities.
 * Uses only consented discoverable profile fields. Missing data skips factors
 * (does not unfairly penalize). Never invents people, traits, or availability.
 */

import {
  activityMatchInList,
  normalizeActivityLabel,
  relatedActivities,
} from "@/lib/community/activity-affinity";
import {
  daysOverlap,
  hoursOverlap,
  type PeopleMatchCandidate,
} from "@/lib/community/recommend-people";
import { isNearPostLocality } from "@/lib/community/location-match";
import { skillCompatible } from "@/lib/recommendations/skill";
import type {
  CompatibilityMatch,
  CompatibilityResult,
  CompatibilityViewer,
  CompatibilityWeights,
} from "@/types/compatibility";
import { DEFAULT_COMPATIBILITY_WEIGHTS } from "@/types/compatibility";
import type { RecommendationReason } from "@/types/recommendations";

export { DEFAULT_COMPATIBILITY_WEIGHTS };

function sharedInterestLabels(
  viewerInterests: string[],
  peerInterests: string[],
): { exact: string[]; related: string[] } {
  const exact: string[] = [];
  const related: string[] = [];
  const peerLower = peerInterests.map((i) => i.toLowerCase());

  for (const raw of viewerInterests) {
    const needle = normalizeActivityLabel(raw);
    if (!needle) continue;
    if (peerLower.some((p) => p.includes(needle) || needle.includes(p))) {
      if (!exact.includes(needle)) exact.push(needle);
      continue;
    }
    const rel = relatedActivities(needle);
    for (const r of rel) {
      if (peerLower.some((p) => p.includes(r) || r.includes(p))) {
        if (!related.includes(r) && !exact.includes(needle)) {
          related.push(`${needle}↔${r}`);
        }
        break;
      }
    }
  }
  return { exact, related };
}

/**
 * Score one discoverable peer against the viewer.
 * Returns null when hard privacy/locality/self rules fail or no evidence.
 */
export function scorePeerCompatibility(
  viewer: CompatibilityViewer,
  peer: PeopleMatchCandidate,
  weights: CompatibilityWeights = DEFAULT_COMPATIBILITY_WEIGHTS,
): CompatibilityMatch | null {
  if (!peer.discoverable) return null;
  if (peer.id === viewer.id) return null;

  const reasons: RecommendationReason[] = [];
  let rawScore = 0;
  let rawMax = 0;

  // --- Shared interests (only when both list interests) ---
  if (viewer.interests.length > 0 && peer.interests.length > 0) {
    const { exact, related } = sharedInterestLabels(
      viewer.interests,
      peer.interests,
    );
    if (exact.length > 0) {
      rawMax += weights.shared_interest;
      rawScore += weights.shared_interest;
      const label =
        exact.length === 1
          ? `Both interested in ${exact[0]}`
          : `Shared interests: ${exact.slice(0, 3).join(", ")}`;
      reasons.push({ code: "shared_interest", label });
    } else if (related.length > 0) {
      rawMax += weights.similar_activity;
      rawScore += weights.similar_activity;
      reasons.push({
        code: "similar_activity",
        label: `Related activities (${related[0]})`,
      });
    } else {
      // Both declared interests but no overlap — applicable factor scored 0.
      rawMax += weights.shared_interest;
    }
  }
  // If either side has no interests, skip interest factors entirely (no penalty).

  // --- Schedule days (only when both declared days) ---
  if (viewer.availabilityDays.length > 0 && peer.availabilityDays.length > 0) {
    rawMax += weights.schedule_day;
    const dayHits = daysOverlap(viewer.availabilityDays, peer.availabilityDays);
    if (dayHits.length > 0) {
      rawScore += weights.schedule_day;
      const dayLabel =
        dayHits.length === 1
          ? dayHits[0]
          : dayHits.slice(0, 3).join(", ");
      reasons.push({
        code: "schedule_overlap",
        label: `Availability overlaps ${dayLabel}`,
      });
    }
  }

  // --- Schedule hours (only when both declared windows) ---
  if (
    viewer.availabilityStartHour != null &&
    viewer.availabilityEndHour != null &&
    peer.availabilityStartHour != null &&
    peer.availabilityEndHour != null
  ) {
    rawMax += weights.schedule_hour;
    if (
      hoursOverlap(
        viewer.availabilityStartHour,
        viewer.availabilityEndHour,
        peer.availabilityStartHour,
        peer.availabilityEndHour,
      )
    ) {
      rawScore += weights.schedule_hour;
      reasons.push({
        code: "schedule_overlap",
        label: "Availability overlaps in the same time window",
      });
    }
  }

  // --- Skill (only when both declared a concrete skill) ---
  if (
    viewer.skillLevel &&
    viewer.skillLevel !== "any" &&
    peer.skillLevel &&
    peer.skillLevel !== "any"
  ) {
    rawMax += weights.skill_fit;
    const fit = skillCompatible(viewer.skillLevel, peer.skillLevel);
    if (fit === "mismatch") {
      // Hard filter: incompatible stated skills
      return null;
    }
    if (fit === "fit") {
      rawScore += weights.skill_fit;
      reasons.push({
        code: "skill_fit",
        label: `Compatible skill level (${peer.skillLevel})`,
      });
    }
  }

  // --- Area (only when we can evaluate locality) ---
  const viewerHasCenter =
    viewer.discoveryLat != null &&
    viewer.discoveryLng != null &&
    Number.isFinite(viewer.discoveryLat) &&
    Number.isFinite(viewer.discoveryLng);
  const peerHasPin =
    Number.isFinite(peer.discoveryLat) && Number.isFinite(peer.discoveryLng);
  const hasCityContext = Boolean(viewer.city?.trim() || peer.city?.trim());

  if (viewerHasCenter || hasCityContext) {
    const locality = isNearPostLocality({
      coordinates: peerHasPin
        ? { lat: peer.discoveryLat, lng: peer.discoveryLng }
        : null,
      locationText: `${peer.city ?? ""} ${peer.neighborhood ?? ""}`,
      city: viewer.city,
      searchCenter: viewerHasCenter
        ? { lat: viewer.discoveryLat!, lng: viewer.discoveryLng! }
        : null,
      radiusKm: viewer.preferredRadiusKm ?? peer.preferredRadiusKm ?? 40,
    });
    if (!locality.ok) return null;
    rawMax += weights.area_proximity;
    if (locality.sameCityLabel) {
      rawScore += weights.area_proximity;
      reasons.push({
        code: "same_city",
        label: `Same area (${peer.city ?? viewer.city})`,
      });
    } else if (locality.km != null) {
      const radius = viewer.preferredRadiusKm ?? 40;
      const frac = 1 - Math.min(1, locality.km / Math.max(radius, 0.001));
      rawScore += weights.area_proximity * frac;
      if (frac > 0.35) {
        reasons.push({
          code: "within_distance",
          label: locality.reason ?? `About ${locality.km.toFixed(1)} km away`,
        });
      }
    } else if (locality.reason) {
      rawScore += weights.area_proximity * 0.6;
      reasons.push({ code: "within_distance", label: locality.reason });
    }
  }

  // Require at least one positive evidence reason (not empty / invented).
  const evidence = reasons.some((r) =>
    ["shared_interest", "similar_activity", "schedule_overlap", "skill_fit", "same_city", "within_distance"].includes(
      r.code,
    ),
  );
  if (!evidence || rawMax <= 0) return null;

  const scorePercent = Math.round((rawScore / rawMax) * 1000) / 10;
  const { exact } = sharedInterestLabels(viewer.interests, peer.interests);

  return {
    id: peer.id,
    displayName: peer.displayName,
    bio: peer.bio,
    city: peer.city,
    neighborhood: peer.neighborhood,
    interests: peer.interests,
    skillLevel: peer.skillLevel,
    discoveryLat: peerHasPin ? peer.discoveryLat : null,
    discoveryLng: peerHasPin ? peer.discoveryLng : null,
    acceptsMessages: peer.acceptsMessages,
    presenceNote:
      "Approximate discovery pin from their profile — not a live location. Compatibility uses only fields they chose to share.",
    scorePercent,
    rawScore: Math.round(rawScore * 100) / 100,
    rawMax: Math.round(rawMax * 100) / 100,
    reasons,
    sharedInterests: exact,
  };
}

export function rankCompatibleTeammates(
  viewer: CompatibilityViewer,
  candidates: PeopleMatchCandidate[],
  options?: {
    blockedIds?: Set<string>;
    weights?: CompatibilityWeights;
    limit?: number;
  },
): CompatibilityResult {
  const weights = options?.weights ?? DEFAULT_COMPATIBILITY_WEIGHTS;
  const blocked = options?.blockedIds ?? new Set<string>();
  const limit = options?.limit ?? 12;

  const matches = candidates
    .filter((c) => !blocked.has(c.id))
    .map((c) => scorePeerCompatibility(viewer, c, weights))
    .filter((m): m is CompatibilityMatch => m != null)
    .sort(
      (a, b) =>
        b.scorePercent - a.scorePercent ||
        b.rawScore - a.rawScore ||
        a.id.localeCompare(b.id),
    )
    .slice(0, limit);

  return {
    method: "deterministic-profile-compatibility",
    methodNote:
      "Explainable overlap of shared interests, stated availability, skill, and approximate area. Missing fields are skipped, not penalized. Hidden/blocked profiles never appear.",
    viewerId: viewer.id,
    weights,
    matches,
    emptyReason:
      matches.length === 0
        ? "No discoverable profiles matched your shared interests or availability. Update your profile interests and schedule, or check back as more people opt into discovery."
        : null,
  };
}

/** Build viewer snapshot from own profile fields only (never invent). */
export function viewerFromOwnProfile(profile: {
  id: string;
  interests: string[];
  skillLevel: CompatibilityViewer["skillLevel"];
  availabilityDays: CompatibilityViewer["availabilityDays"];
  availabilityStartHour: number | null;
  availabilityEndHour: number | null;
  city: string | null;
  discoveryLat: number | null;
  discoveryLng: number | null;
  preferredRadiusKm: number | null;
}): CompatibilityViewer {
  return {
    id: profile.id,
    interests: [...profile.interests],
    skillLevel: profile.skillLevel,
    availabilityDays: [...profile.availabilityDays],
    availabilityStartHour: profile.availabilityStartHour,
    availabilityEndHour: profile.availabilityEndHour,
    city: profile.city,
    discoveryLat: profile.discoveryLat,
    discoveryLng: profile.discoveryLng,
    preferredRadiusKm: profile.preferredRadiusKm,
  };
}

/** Soft check used in tests — activity listed on peer. */
export function peerHasInterest(
  peer: PeopleMatchCandidate,
  activity: string,
): boolean {
  return activityMatchInList(peer.interests, activity) !== "none";
}
