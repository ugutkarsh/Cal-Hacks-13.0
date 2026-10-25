/**
 * Recommendations for a community post from real catalog + discoverable profiles.
 */

import { NextResponse } from "next/server";
import { mapCommunityPost, POST_SELECT } from "@/lib/community/mappers";
import { recommendForCommunityPost } from "@/lib/community/recommend-for-post";
import { assertReadable, loadPostAccess } from "@/lib/community/post-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { DbCommunityPostWithAuthor } from "@/types/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isUuid(id)) {
    return NextResponse.json(
      { ok: false, error: "Invalid post id" },
      { status: 400 },
    );
  }

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

  const access = await loadPostAccess(supabase, id);
  if (!access.ok) {
    if ("notFound" in access) {
      return NextResponse.json(
        { ok: false, error: "Post not found" },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { ok: false, error: access.error },
      { status: 503 },
    );
  }

  const readErr = assertReadable(access.post, user);
  if (readErr) {
    return NextResponse.json({ ok: false, error: readErr }, { status: 404 });
  }

  const { data: postRow, error: postError } = await supabase
    .from("community_posts")
    .select(POST_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (postError || !postRow) {
    return NextResponse.json(
      { ok: false, error: postError?.message ?? "Post not found" },
      { status: postError ? 500 : 404 },
    );
  }

  const post = mapCommunityPost(
    postRow as unknown as DbCommunityPostWithAuthor,
    user?.id ?? null,
  );

  // Discoverable profiles via fuzzed public view (no dm_policy enum).
  let profileRows: Array<Record<string, unknown>> = [];
  const viewAttempt = await supabase
    .from("discoverable_profiles_public")
    .select(
      "id, display_name, avatar_url, bio, city, neighborhood, interests, skill_level, availability_days, availability_start_hour, availability_end_hour, preferred_radius_km, discovery_lat, discovery_lng, discoverable, location_share_level",
    );
  if (!viewAttempt.error && viewAttempt.data) {
    profileRows = viewAttempt.data as Array<Record<string, unknown>>;
  } else {
    // Fallback: never select dm_policy into client-bound paths; derive accepts later.
    const tableAttempt = await supabase
      .from("profiles")
      .select(
        "id, display_name, avatar_url, bio, city, neighborhood, interests, skill_level, availability_days, availability_start_hour, availability_end_hour, preferred_radius_km, discovery_lat, discovery_lng, discoverable, location_share_level",
      )
      .eq("discoverable", true)
      .neq("location_share_level", "hidden");
    if (!tableAttempt.error && tableAttempt.data) {
      profileRows = tableAttempt.data as Array<Record<string, unknown>>;
    }
  }

  let blockedUserIds: Set<string> | undefined;
  if (user) {
    const { loadBlockedPeerIds } = await import("@/lib/privacy/blocks");
    blockedUserIds = await loadBlockedPeerIds(supabase, user.id);
  }

  // Active looking posts — evidence only, never invent.
  const lookingRes = await supabase
    .from("community_posts")
    .select("owner_id, intent, activity")
    .eq("status", "open")
    .in("intent", ["find_teammates", "find_venue", "organize_meetup"])
    .neq("owner_id", post.ownerId)
    .limit(200);

  const lookingPosts = (lookingRes.data ?? []).map((row) => ({
    ownerId: row.owner_id as string,
    intent: row.intent as string,
    activity: (row.activity as string | null) ?? null,
  }));

  try {
    const recommendations = await recommendForCommunityPost({
      post,
      viewerId: user?.id ?? null,
      profileRows,
      lookingPosts,
      blockedUserIds,
    });
    return NextResponse.json({ ok: true, recommendations });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "Recommendations failed",
        note: "No fabricated matches — fix the error and retry.",
      },
      { status: 500 },
    );
  }
}
