/**
 * Map DB community_posts rows ↔ API shapes.
 * Never includes discovery_lat/lng or dm_policy.
 */

import type {
  CommunityPost,
  CommunityPostCreateInput,
  CommunityPostUpdateInput,
  PostAuthorPublic,
  PostIntent,
  PostStatus,
  PostVisibility,
} from "@/types/community-post";
import type {
  DbCommunityPost,
  DbCommunityPostWithAuthor,
  DbSkillLevel,
} from "@/types/database";
import type { ActivityCategory } from "@/types/map-entities";
import type { DayOfWeek, SkillPreference } from "@/types/preferences";

const DAYS = new Set<string>([
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
]);

function asDays(value: string[] | null | undefined): DayOfWeek[] {
  if (!value) return [];
  return value.filter((d): d is DayOfWeek => DAYS.has(d));
}

function asCategory(value: string | null): ActivityCategory | null {
  if (!value) return null;
  const allowed: ActivityCategory[] = [
    "hiking",
    "cycling",
    "running",
    "outdoor",
    "meetup",
    "climbing",
    "sports",
    "other",
  ];
  return (allowed as string[]).includes(value)
    ? (value as ActivityCategory)
    : null;
}

function asSkill(value: DbSkillLevel | null): SkillPreference | null {
  return value ?? null;
}

function mapAuthor(
  profiles: DbCommunityPostWithAuthor["profiles"],
  viewerId: string | null,
  ownerId: string,
): PostAuthorPublic | null {
  if (!profiles) return null;
  const isOwner = viewerId === ownerId;
  // Non-owners only see author identity when the profile is discoverable.
  if (!isOwner && !profiles.discoverable) {
    return {
      id: profiles.id,
      displayName: "Community member",
      avatarUrl: null,
      city: null,
      neighborhood: null,
      discoverable: false,
    };
  }
  return {
    id: profiles.id,
    displayName: profiles.display_name,
    avatarUrl: profiles.avatar_url,
    city: profiles.city,
    neighborhood: profiles.neighborhood,
    discoverable: profiles.discoverable,
  };
}

function normalizeAuthorRelation(
  profiles: DbCommunityPostWithAuthor["profiles"] | DbCommunityPostWithAuthor["profiles"][] | null | undefined,
): DbCommunityPostWithAuthor["profiles"] {
  if (!profiles) return null;
  if (Array.isArray(profiles)) return profiles[0] ?? null;
  return profiles;
}

export function mapCommunityPost(
  row: DbCommunityPost | DbCommunityPostWithAuthor,
  viewerId: string | null,
): CommunityPost {
  const withAuthor = row as DbCommunityPostWithAuthor & {
    profiles?:
      | DbCommunityPostWithAuthor["profiles"]
      | DbCommunityPostWithAuthor["profiles"][];
  };
  return {
    id: row.id,
    ownerId: row.owner_id,
    message: row.message,
    activity: row.activity,
    category: asCategory(row.category),
    city: row.city,
    neighborhood: row.neighborhood,
    preferredDays: asDays(row.preferred_days),
    timeStartHour: row.time_start_hour,
    timeEndHour: row.time_end_hour,
    intent: row.intent as PostIntent,
    skillLevel: asSkill(row.skill_level),
    budgetCents: row.budget_cents ?? null,
    radiusKm: row.radius_km,
    visibility: row.visibility as PostVisibility,
    status: row.status as PostStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isOwner: viewerId === row.owner_id,
    author: mapAuthor(
      normalizeAuthorRelation(withAuthor.profiles),
      viewerId,
      row.owner_id,
    ),
  };
}

/** DB insert payload — owner_id supplied separately from auth. */
export function createInputToDbInsert(
  input: CommunityPostCreateInput,
  ownerId: string,
): Record<string, unknown> {
  return {
    owner_id: ownerId,
    message: input.message,
    activity: input.activity ?? null,
    category: input.category ?? null,
    city: input.city ?? null,
    neighborhood: input.neighborhood ?? null,
    preferred_days: input.preferredDays ?? [],
    time_start_hour: input.timeStartHour ?? null,
    time_end_hour: input.timeEndHour ?? null,
    intent: input.intent ?? "find_teammates",
    skill_level: input.skillLevel ?? null,
    budget_cents: input.budgetCents ?? null,
    radius_km: input.radiusKm ?? null,
    visibility: input.visibility ?? "public",
    status: input.status ?? "open",
  };
}

/** DB update patch — never includes owner_id / id. */
export function updateInputToDbPatch(
  input: CommunityPostUpdateInput,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (input.message !== undefined) patch.message = input.message;
  if (input.activity !== undefined) patch.activity = input.activity;
  if (input.category !== undefined) patch.category = input.category;
  if (input.city !== undefined) patch.city = input.city;
  if (input.neighborhood !== undefined) patch.neighborhood = input.neighborhood;
  if (input.preferredDays !== undefined) {
    patch.preferred_days = input.preferredDays;
  }
  if (input.timeStartHour !== undefined) {
    patch.time_start_hour = input.timeStartHour;
  }
  if (input.timeEndHour !== undefined) patch.time_end_hour = input.timeEndHour;
  if (input.intent !== undefined) patch.intent = input.intent;
  if (input.skillLevel !== undefined) patch.skill_level = input.skillLevel;
  if (input.budgetCents !== undefined) patch.budget_cents = input.budgetCents;
  if (input.radiusKm !== undefined) patch.radius_km = input.radiusKm;
  if (input.visibility !== undefined) patch.visibility = input.visibility;
  if (input.status !== undefined) patch.status = input.status;
  return patch;
}

export const POST_SELECT =
  "id, owner_id, message, activity, category, city, neighborhood, preferred_days, time_start_hour, time_end_hour, intent, skill_level, budget_cents, radius_km, visibility, status, created_at, updated_at, profiles!owner_id(id, display_name, avatar_url, city, neighborhood, discoverable)";
