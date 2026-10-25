/**
 * Express / withdraw / list interest on a community post.
 * user_id always from auth.uid(); duplicate prevented by unique constraint.
 */

import { NextResponse } from "next/server";
import { loadInteractionCounts } from "@/lib/community/interaction-counts";
import { mapInterest, INTEREST_SELECT } from "@/lib/community/interaction-mappers";
import { isDuplicateInterestError } from "@/lib/community/interaction-validation";
import {
  assertCanListInterests,
  assertInteractable,
  assertReadable,
  loadPostAccess,
} from "@/lib/community/post-access";
import { areUsersBlocked } from "@/lib/privacy/blocks";
import {
  checkRateLimit,
  rateLimitExceededResponse,
} from "@/lib/privacy/rate-limit";
import { publicApiError } from "@/lib/privacy/safe-error";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { DbCommunityPostInterestWithUser } from "@/types/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

async function getClient() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return {
      error: NextResponse.json(
        { ok: false, error: "Supabase is not configured" },
        { status: 503 },
      ),
    } as const;
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user } as const;
}

/** Owner: list interested users. Others: count + viewerInterested only. */
export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isUuid(id)) {
    return NextResponse.json(
      { ok: false, error: "Invalid post id" },
      { status: 400 },
    );
  }

  const client = await getClient();
  if ("error" in client) return client.error;

  const access = await loadPostAccess(client.supabase, id);
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

  const readErr = assertReadable(access.post, client.user);
  if (readErr) {
    return NextResponse.json({ ok: false, error: readErr }, { status: 404 });
  }

  const counts = await loadInteractionCounts(
    client.supabase,
    id,
    client.user?.id ?? null,
  );

  const listErr = assertCanListInterests(access.post, client.user);
  if (listErr) {
    return NextResponse.json({
      ok: true,
      interestCount: counts.interestCount,
      viewerInterested: counts.viewerInterested,
      interests: null,
    });
  }

  const { data, error } = await client.supabase
    .from("community_post_interests")
    .select(INTEREST_SELECT)
    .eq("post_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    const missing = /community_post_interests|does not exist|schema cache/i.test(
      error.message,
    );
    return NextResponse.json(
      {
        ok: false,
        error: missing
          ? "Interest table missing — apply migration 20261024220000_community_post_interactions.sql"
          : publicApiError("Could not load interests", error),
      },
      { status: missing ? 503 : 500 },
    );
  }

  const rows = (data ?? []) as unknown as DbCommunityPostInterestWithUser[];
  return NextResponse.json({
    ok: true,
    interestCount: counts.interestCount,
    viewerInterested: counts.viewerInterested,
    interests: rows.map((row) => mapInterest(row, client.user!.id)),
  });
}

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isUuid(id)) {
    return NextResponse.json(
      { ok: false, error: "Invalid post id" },
      { status: 400 },
    );
  }

  const client = await getClient();
  if ("error" in client) return client.error;
  if (!client.user) {
    return NextResponse.json(
      { ok: false, error: "Sign in required" },
      { status: 401 },
    );
  }

  const access = await loadPostAccess(client.supabase, id);
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

  const interactErr = assertInteractable(access.post, client.user);
  if (interactErr) {
    const status = interactErr === "Sign in required" ? 401 : interactErr === "Post not found" ? 404 : 403;
    return NextResponse.json({ ok: false, error: interactErr }, { status });
  }

  const limited = checkRateLimit("interest_toggle", client.user.id);
  if (!limited.ok) {
    const r = rateLimitExceededResponse(limited.retryAfterSec);
    return NextResponse.json(r.body, { status: r.status, headers: r.headers });
  }

  if (
    await areUsersBlocked(
      client.supabase,
      client.user.id,
      access.post.ownerId,
    )
  ) {
    return NextResponse.json(
      { ok: false, error: "Interaction unavailable" },
      { status: 403 },
    );
  }

  // Ensure profile exists for FK.
  const profile = await client.supabase
    .from("profiles")
    .select("id")
    .eq("id", client.user.id)
    .maybeSingle();
  if (!profile.data) {
    const displayName =
      (typeof client.user.user_metadata?.display_name === "string" &&
        client.user.user_metadata.display_name.trim()) ||
      client.user.email?.split("@")[0] ||
      "Trailmapper";
    await client.supabase.from("profiles").insert({
      id: client.user.id,
      display_name: displayName.slice(0, 80),
    });
  }

  const { data, error } = await client.supabase
    .from("community_post_interests")
    .insert({
      post_id: id,
      user_id: client.user.id,
    })
    .select(INTEREST_SELECT)
    .single();

  if (error) {
    if (isDuplicateInterestError(error.message)) {
      const counts = await loadInteractionCounts(
        client.supabase,
        id,
        client.user.id,
      );
      return NextResponse.json(
        {
          ok: false,
          error: "You already expressed interest in this post",
          interestCount: counts.interestCount,
          viewerInterested: true,
        },
        { status: 409 },
      );
    }
    const missing = /community_post_interests|does not exist|schema cache/i.test(
      error.message,
    );
    return NextResponse.json(
      {
        ok: false,
        error: missing
          ? "Interest table missing — apply migration 20261024220000_community_post_interactions.sql"
          : error.message,
      },
      { status: missing ? 503 : 500 },
    );
  }

  const counts = await loadInteractionCounts(
    client.supabase,
    id,
    client.user.id,
  );

  return NextResponse.json(
    {
      ok: true,
      interest: mapInterest(
        data as unknown as DbCommunityPostInterestWithUser,
        client.user.id,
      ),
      interestCount: counts.interestCount,
      viewerInterested: true,
    },
    { status: 201 },
  );
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isUuid(id)) {
    return NextResponse.json(
      { ok: false, error: "Invalid post id" },
      { status: 400 },
    );
  }

  const client = await getClient();
  if ("error" in client) return client.error;
  if (!client.user) {
    return NextResponse.json(
      { ok: false, error: "Sign in required" },
      { status: 401 },
    );
  }

  const access = await loadPostAccess(client.supabase, id);
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

  const readErr = assertReadable(access.post, client.user);
  if (readErr) {
    return NextResponse.json({ ok: false, error: readErr }, { status: 404 });
  }

  const { data, error } = await client.supabase
    .from("community_post_interests")
    .delete()
    .eq("post_id", id)
    .eq("user_id", client.user.id)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json(
      { ok: false, error: "No interest to withdraw" },
      { status: 404 },
    );
  }

  const counts = await loadInteractionCounts(
    client.supabase,
    id,
    client.user.id,
  );

  return NextResponse.json({
    ok: true,
    withdrawn: true,
    interestCount: counts.interestCount,
    viewerInterested: false,
  });
}
