import type {
  DbDmPolicy,
  DbLocationShareLevel,
  DbProfile,
  DbSkillLevel,
} from "@/types/database";

/** Fill missing social columns when reading a pre-migration profiles row. */
export function normalizeProfileRow(row: Record<string, unknown>): DbProfile {
  const dm = row.dm_policy;
  const skill = row.skill_level;
  const share = row.location_share_level;
  return {
    id: String(row.id ?? ""),
    display_name: String(row.display_name ?? ""),
    avatar_url:
      typeof row.avatar_url === "string" ? row.avatar_url : null,
    bio: typeof row.bio === "string" ? row.bio : null,
    city: typeof row.city === "string" ? row.city : null,
    neighborhood:
      typeof row.neighborhood === "string" ? row.neighborhood : null,
    discoverable: row.discoverable === true,
    discovery_lat:
      typeof row.discovery_lat === "number" ? row.discovery_lat : null,
    discovery_lng:
      typeof row.discovery_lng === "number" ? row.discovery_lng : null,
    location_share_level:
      share === "hidden" || share === "city_only" || share === "approximate"
        ? (share as DbLocationShareLevel)
        : "approximate",
    interests: Array.isArray(row.interests)
      ? (row.interests as string[])
      : [],
    skill_level:
      skill === "beginner" ||
      skill === "intermediate" ||
      skill === "advanced" ||
      skill === "any"
        ? (skill as DbSkillLevel)
        : null,
    availability_days: Array.isArray(row.availability_days)
      ? (row.availability_days as string[])
      : [],
    availability_start_hour:
      typeof row.availability_start_hour === "number"
        ? row.availability_start_hour
        : null,
    availability_end_hour:
      typeof row.availability_end_hour === "number"
        ? row.availability_end_hour
        : null,
    preferred_radius_km:
      typeof row.preferred_radius_km === "number"
        ? row.preferred_radius_km
        : null,
    dm_policy:
      dm === "everyone" || dm === "discoverable_only" || dm === "nobody"
        ? (dm as DbDmPolicy)
        : "discoverable_only",
    created_at:
      typeof row.created_at === "string"
        ? row.created_at
        : new Date().toISOString(),
    updated_at:
      typeof row.updated_at === "string"
        ? row.updated_at
        : typeof row.created_at === "string"
          ? row.created_at
          : new Date().toISOString(),
  };
}
