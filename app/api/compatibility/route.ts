/**
 * GET /api/compatibility — rank discoverable teammates for the signed-in viewer.
 * Uses public discoverable profile projection + block filtering.
 * Never returns dm_policy enum, unfuzzed coords, or non-discoverable profiles.
 */

import { NextResponse } from "next/server";
import {
  rankCompatibleTeammates,
  viewerFromOwnProfile,
} from "@/lib/community/compatibility";
import { profilesToPeopleCandidates } from "@/lib/community/recommend-for-post";
import { loadBlockedPeerIds } from "@/lib/privacy/blocks";
import { mapOwnProfile } from "@/lib/profiles/mappers";
import { PROFILE_SELECT_FULL } from "@/lib/profiles/select";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { DbProfile } from "@/types/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Matches discoverable_profiles_public (no dm_policy / accepts_messages column). */
const PUBLIC_PROFILE_SELECT =
  "id, display_name, avatar_url, bio, city, neighborhood, interests, skill_level, availability_days, availability_start_hour, availability_end_hour, preferred_radius_km, discovery_lat, discovery_lng, discoverable, location_share_level";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Supabase is not configured" },
      { status: 503 },
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Sign in to see compatible teammates" },
      { status: 401 },
    );
  }

  const { data: ownRow, error: ownError } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT_FULL)
    .eq("id", user.id)
    .maybeSingle();

  if (ownError || !ownRow) {
    return NextResponse.json(
      {
        ok: false,
        error: ownError?.message ?? "Complete your profile to use compatibility",
      },
      { status: ownError ? 500 : 404 },
    );
  }

  const own = mapOwnProfile(ownRow as DbProfile);
  const viewer = viewerFromOwnProfile(own);

  // Discoverable peers via fuzzed public view (no dm_policy).
  let profileRows: Array<Record<string, unknown>> = [];
  const viewAttempt = await supabase
    .from("discoverable_profiles_public")
    .select(PUBLIC_PROFILE_SELECT);
  if (!viewAttempt.error && viewAttempt.data) {
    profileRows = viewAttempt.data as Array<Record<string, unknown>>;
  } else {
    const tableAttempt = await supabase
      .from("profiles")
      .select(
        "id, display_name, avatar_url, bio, city, neighborhood, interests, skill_level, availability_days, availability_start_hour, availability_end_hour, preferred_radius_km, discovery_lat, discovery_lng, discoverable, location_share_level",
      )
      .eq("discoverable", true)
      .neq("location_share_level", "hidden");
    if (!tableAttempt.error && tableAttempt.data) {
      profileRows = tableAttempt.data as Array<Record<string, unknown>>;
    } else if (tableAttempt.error) {
      return NextResponse.json(
        { ok: false, error: "Could not load discoverable profiles" },
        { status: 503 },
      );
    }
  }

  // Optional: active looking posts (evidence only — never invent).
  const lookingByOwner = new Map<
    string,
    { ownerId: string; intent: string; activity: string | null }
  >();
  const lookingAttempt = await supabase
    .from("community_posts")
    .select("owner_id, intent, activity, status, visibility")
    .eq("status", "open")
    .eq("visibility", "community")
    .in("intent", ["find_teammates", "find_venue", "join_activity"]);
  if (!lookingAttempt.error && lookingAttempt.data) {
    for (const row of lookingAttempt.data) {
      const ownerId = row.owner_id as string;
      if (!lookingByOwner.has(ownerId)) {
        lookingByOwner.set(ownerId, {
          ownerId,
          intent: String(row.intent),
          activity: typeof row.activity === "string" ? row.activity : null,
        });
      }
    }
  }

  const candidates = profilesToPeopleCandidates(
    profileRows,
    lookingByOwner,
  ).filter((c) => c.id !== user.id);

  const blockedIds = await loadBlockedPeerIds(supabase, user.id);
  const result = rankCompatibleTeammates(viewer, candidates, {
    blockedIds,
    limit: 16,
  });

  // Strip anything that could leak private policy enums — response is already public-shaped.
  return NextResponse.json({
    ok: true,
    ...result,
    viewerHints: {
      hasInterests: viewer.interests.length > 0,
      hasAvailability: viewer.availabilityDays.length > 0,
      hasArea: Boolean(viewer.city || viewer.discoveryLat != null),
      discoverable: own.discoverable,
    },
  });
}
