/**
 * Map DB profile rows ↔ API DTOs. Public projection never includes dm_policy
 * enum or unfuzzed private coordinates.
 */

import type { DbProfile } from "@/types/database";
import type { DayOfWeek, SkillPreference } from "@/types/preferences";
import type {
  LocationShareLevel,
  OwnProfile,
  ProfileUpdateInput,
  PublicProfile,
} from "@/types/profile";
import { fuzzDiscoveryCoordinate } from "@/lib/profiles/validation";

function toShareLevel(
  raw: string | null | undefined,
): LocationShareLevel {
  if (raw === "hidden" || raw === "city_only" || raw === "approximate") {
    return raw;
  }
  return "approximate";
}

const DAYS = new Set<string>([
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
]);

function toDays(raw: string[] | null | undefined): DayOfWeek[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((d): d is DayOfWeek => DAYS.has(d));
}

function toSkill(
  raw: string | null | undefined,
): SkillPreference | null {
  if (
    raw === "beginner" ||
    raw === "intermediate" ||
    raw === "advanced" ||
    raw === "any"
  ) {
    return raw;
  }
  return null;
}

export function mapOwnProfile(row: DbProfile): OwnProfile {
  return {
    id: row.id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    bio: row.bio,
    city: row.city ?? null,
    neighborhood: row.neighborhood ?? null,
    interests: Array.isArray(row.interests) ? [...row.interests] : [],
    skillLevel: toSkill(row.skill_level),
    availabilityDays: toDays(row.availability_days),
    availabilityStartHour: row.availability_start_hour ?? null,
    availabilityEndHour: row.availability_end_hour ?? null,
    preferredRadiusKm: row.preferred_radius_km ?? null,
    discoverable: row.discoverable === true,
    discoveryLat: row.discovery_lat,
    discoveryLng: row.discovery_lng,
    locationShareLevel: toShareLevel(row.location_share_level),
    dmPolicy: row.dm_policy ?? "discoverable_only",
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
  };
}

/**
 * Public card for another user. Requires discoverable.
 * Pin only when location_share_level is approximate; always fuzzed.
 */
export function mapPublicProfile(
  row: DbProfile,
  options?: { acceptsMessages?: boolean },
): PublicProfile | null {
  if (!row.discoverable) return null;
  const share = toShareLevel(row.location_share_level);
  if (share === "hidden") return null;

  const hasPin =
    typeof row.discovery_lat === "number" &&
    typeof row.discovery_lng === "number" &&
    Number.isFinite(row.discovery_lat) &&
    Number.isFinite(row.discovery_lng);

  if (share === "approximate" && !hasPin) return null;

  const dm = row.dm_policy ?? "discoverable_only";
  const acceptsMessages =
    options?.acceptsMessages ??
    (dm === "everyone" || dm === "discoverable_only");

  return {
    id: row.id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    bio: row.bio,
    city: row.city ?? null,
    neighborhood: row.neighborhood ?? null,
    interests: Array.isArray(row.interests) ? [...row.interests] : [],
    skillLevel: toSkill(row.skill_level),
    availabilityDays: toDays(row.availability_days),
    availabilityStartHour: row.availability_start_hour ?? null,
    availabilityEndHour: row.availability_end_hour ?? null,
    preferredRadiusKm: row.preferred_radius_km ?? null,
    discoveryLat:
      share === "approximate" && hasPin
        ? fuzzDiscoveryCoordinate(row.discovery_lat!)
        : null,
    discoveryLng:
      share === "approximate" && hasPin
        ? fuzzDiscoveryCoordinate(row.discovery_lng!)
        : null,
    locationShareLevel: share,
    acceptsMessages,
    presenceNote:
      share === "city_only"
        ? "City-level presence only — no map pin shared."
        : "Approximate discovery pin from their city — not a live location.",
  };
}

export function ownProfileToDbPatch(
  input: ProfileUpdateInput,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (input.displayName !== undefined) patch.display_name = input.displayName;
  if (input.avatarUrl !== undefined) patch.avatar_url = input.avatarUrl;
  if (input.bio !== undefined) patch.bio = input.bio;
  if (input.city !== undefined) patch.city = input.city;
  if (input.neighborhood !== undefined) patch.neighborhood = input.neighborhood;
  if (input.interests !== undefined) patch.interests = input.interests;
  if (input.skillLevel !== undefined) patch.skill_level = input.skillLevel;
  if (input.availabilityDays !== undefined) {
    patch.availability_days = input.availabilityDays;
  }
  if (input.availabilityStartHour !== undefined) {
    patch.availability_start_hour = input.availabilityStartHour;
  }
  if (input.availabilityEndHour !== undefined) {
    patch.availability_end_hour = input.availabilityEndHour;
  }
  if (input.preferredRadiusKm !== undefined) {
    patch.preferred_radius_km = input.preferredRadiusKm;
  }
  if (input.discoverable !== undefined) patch.discoverable = input.discoverable;
  if (input.discoveryLat !== undefined) {
    patch.discovery_lat = input.discoveryLat;
  }
  if (input.discoveryLng !== undefined) {
    patch.discovery_lng = input.discoveryLng;
  }
  if (input.locationShareLevel !== undefined) {
    patch.location_share_level = input.locationShareLevel;
  }
  if (input.dmPolicy !== undefined) patch.dm_policy = input.dmPolicy;
  return patch;
}
