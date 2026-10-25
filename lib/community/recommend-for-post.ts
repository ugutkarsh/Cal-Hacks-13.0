/**
 * Orchestrate place + event + people recommendations for one community post.
 */

import {
  communityPostToMatchQuery,
} from "@/lib/community/post-to-preferences";
import { recommendEventsForPost } from "@/lib/community/recommend-events";
import {
  recommendPeopleForPost,
  type PeopleMatchCandidate,
} from "@/lib/community/recommend-people";
import { recommendVenuesForPost } from "@/lib/community/recommend-places";
import { loadMapEntities } from "@/lib/data/map-entities";
import { getRecommenderUrl } from "@/lib/recommendations/ml-client";
import { geocodeQueryServer } from "@/lib/location/nominatim-server";
import type { CommunityPost } from "@/types/community-post";
import type { PostRecommendationsResult } from "@/types/community-recommendations";
import type { EventEntity, PlaceEntity } from "@/types/map-entities";
import type { DayOfWeek, SkillPreference } from "@/types/preferences";

export type ActiveLookingPost = {
  ownerId: string;
  intent: string;
  activity: string | null;
};

function toSkill(value: unknown): SkillPreference | null {
  if (
    value === "beginner" ||
    value === "intermediate" ||
    value === "advanced" ||
    value === "any"
  ) {
    return value;
  }
  return null;
}

function toDays(value: unknown): DayOfWeek[] {
  if (!Array.isArray(value)) return [];
  const allowed: DayOfWeek[] = [
    "mon",
    "tue",
    "wed",
    "thu",
    "fri",
    "sat",
    "sun",
  ];
  return value.filter((d): d is DayOfWeek =>
    typeof d === "string" && (allowed as string[]).includes(d),
  );
}

export function profilesToPeopleCandidates(
  rows: Array<Record<string, unknown>>,
  lookingByOwner: Map<string, ActiveLookingPost>,
): PeopleMatchCandidate[] {
  const out: PeopleMatchCandidate[] = [];
  for (const row of rows) {
    if (row.discoverable !== true) continue;
    const share =
      typeof row.location_share_level === "string"
        ? row.location_share_level
        : "approximate";
    if (share === "hidden") continue;

    const lat = row.discovery_lat;
    const lng = row.discovery_lng;
    const hasPin =
      typeof lat === "number" &&
      typeof lng === "number" &&
      Number.isFinite(lat) &&
      Number.isFinite(lng);
    // Approximate needs a pin; city_only may match on city labels only.
    if (share !== "city_only" && !hasPin) continue;

    const id = typeof row.id === "string" ? row.id : null;
    const displayName =
      typeof row.display_name === "string" ? row.display_name.trim() : "";
    if (!id || !displayName) continue;

    // Prefer boolean from public view; never expose dm_policy enum to clients.
    const acceptsMessages =
      typeof row.accepts_messages === "boolean"
        ? row.accepts_messages
        : (() => {
            const dm =
              typeof row.dm_policy === "string"
                ? row.dm_policy
                : "discoverable_only";
            return dm === "everyone" || dm === "discoverable_only";
          })();

    const looking = lookingByOwner.get(id);
    const interests = Array.isArray(row.interests)
      ? row.interests.filter((i): i is string => typeof i === "string")
      : [];

    out.push({
      id,
      displayName,
      bio: typeof row.bio === "string" ? row.bio : null,
      city:
        share === "hidden"
          ? null
          : typeof row.city === "string"
            ? row.city
            : null,
      neighborhood:
        share === "hidden"
          ? null
          : typeof row.neighborhood === "string"
            ? row.neighborhood
            : null,
      interests,
      skillLevel: toSkill(row.skill_level),
      availabilityDays: toDays(row.availability_days),
      availabilityStartHour:
        typeof row.availability_start_hour === "number"
          ? row.availability_start_hour
          : null,
      availabilityEndHour:
        typeof row.availability_end_hour === "number"
          ? row.availability_end_hour
          : null,
      preferredRadiusKm:
        typeof row.preferred_radius_km === "number"
          ? row.preferred_radius_km
          : null,
      discoveryLat: hasPin ? Math.round((lat as number) * 100) / 100 : NaN,
      discoveryLng: hasPin ? Math.round((lng as number) * 100) / 100 : NaN,
      discoverable: true,
      acceptsMessages,
      activelyLooking: Boolean(looking),
      activelyLookingNote: looking
        ? `They have an open post (${looking.intent.replace(/_/g, " ")}${
            looking.activity ? ` · ${looking.activity}` : ""
          })`
        : null,
      lookingActivity: looking?.activity ?? null,
    });
  }
  return out;
}

export async function recommendForCommunityPost(input: {
  post: CommunityPost;
  viewerId: string | null;
  profileRows: Array<Record<string, unknown>>;
  lookingPosts: ActiveLookingPost[];
  /** Viewer↔peer blocks — excluded from people recommendations. */
  blockedUserIds?: Set<string>;
}): Promise<PostRecommendationsResult> {
  const { post, viewerId, profileRows, lookingPosts, blockedUserIds } = input;

  let searchCenter = null;
  let geocodeUsed = false;
  if (post.city?.trim()) {
    const q = [post.neighborhood, post.city].filter(Boolean).join(", ");
    const geo = await geocodeQueryServer(q);
    if (geo) {
      searchCenter = { lat: geo.lat, lng: geo.lng };
      geocodeUsed = true;
    }
  }

  const query = communityPostToMatchQuery(post, searchCenter);

  const loaded = await loadMapEntities(
    { search: "", category: "all", kinds: ["event", "place"] },
    { forceDemo: false },
  );

  const events = (loaded.entities ?? []).filter(
    (e): e is EventEntity => e.kind === "event",
  );
  const places = (loaded.entities ?? []).filter(
    (e): e is PlaceEntity => e.kind === "place",
  );

  // If catalog load failed in supabase mode with empty, still return empty honestly.
  const catalogError = loaded.error;

  const lookingByOwner = new Map<string, ActiveLookingPost>();
  for (const lp of lookingPosts) {
    lookingByOwner.set(lp.ownerId, lp);
  }
  let peopleCandidates = profilesToPeopleCandidates(
    profileRows,
    lookingByOwner,
  );
  if (blockedUserIds && blockedUserIds.size > 0) {
    peopleCandidates = peopleCandidates.filter((p) => !blockedUserIds.has(p.id));
  }

  const [eventRecs, venueRecs, peopleRecs] = await Promise.all([
    catalogError
      ? Promise.resolve({
          items: [],
          method: "deterministic-weighted-rules" as const,
          methodNote: `Catalog unavailable: ${catalogError}`,
          emptyReason: "Activity catalog could not be loaded.",
          sklearnUsed: false,
        })
      : recommendEventsForPost(events, query),
    Promise.resolve(
      catalogError
        ? {
            items: [],
            emptyReason: "Place catalog could not be loaded.",
          }
        : recommendVenuesForPost(places, query),
    ),
    Promise.resolve(
      recommendPeopleForPost(peopleCandidates, query, {
        viewerId,
        postOwnerId: post.ownerId,
      }),
    ),
  ]);

  return {
    postId: post.id,
    query: {
      activity: query.activity,
      category: query.category,
      city: query.city,
      preferredDays: query.preferredDays,
      timeStartHour: query.timeStartHour,
      timeEndHour: query.timeEndHour,
      skillLevel: query.skillLevel,
      budgetCents: query.budgetCents,
      radiusKm: query.radiusKm,
      intent: query.intent,
      searchCenter: query.searchCenter,
    },
    events: {
      items: eventRecs.items,
      method: eventRecs.method,
      methodNote: eventRecs.methodNote,
      emptyReason: eventRecs.emptyReason,
    },
    venues: {
      items: venueRecs.items,
      method: "deterministic-place-filters",
      methodNote:
        "Matched to this post’s activity and area. Open hours and booking are not verified.",
      emptyReason: venueRecs.emptyReason,
    },
    people: {
      items: peopleRecs.items,
      method: "deterministic-profile-overlap",
      methodNote:
        "Matched to discoverable people with overlapping interests and availability nearby.",
      emptyReason: peopleRecs.emptyReason,
    },
    integrations: {
      sklearnRecommenderConfigured: Boolean(getRecommenderUrl()),
      sklearnRecommenderUsed: eventRecs.sklearnUsed,
      geocodeUsed,
    },
  };
}
