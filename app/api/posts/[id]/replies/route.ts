/**
 * List + create replies on a community post (chronological).
 * author_id always from auth.uid().
 */

import { NextResponse } from "next/server";
import { loadInteractionCounts } from "@/lib/community/interaction-counts";
import { mapReply, REPLY_SELECT } from "@/lib/community/interaction-mappers";
import { parseReplyCreate } from "@/lib/community/interaction-validation";
import {
  assertInteractable,
  assertReadable,
  loadPostAccess,
} from "@/lib/community/post-access";
import { areUsersBlocked } from "@/lib/privacy/blocks";
import {
  checkRateLimit,
  rateLimitExceededResponse,
} from "@/lib/privacy/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { DbCommunityPostReplyWithAuthor } from "@/types/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const REPLY_LIST_MAX = 100;

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

export async function GET(request: Request, context: RouteContext) {
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

  const url = new URL(request.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(limitRaw)
    ? Math.min(REPLY_LIST_MAX, Math.max(1, Math.floor(limitRaw)))
    : 50;

  const { data, error } = await client.supabase
    .from("community_post_replies")
    .select(REPLY_SELECT)
    .eq("post_id", id)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit);

  if (error) {
    const missing = /community_post_replies|does not exist|schema cache/i.test(
      error.message,
    );
    return NextResponse.json(
      {
        ok: false,
        error: missing
          ? "Replies table missing — apply migration 20261024220000_community_post_interactions.sql"
          : error.message,
      },
      { status: missing ? 503 : 500 },
    );
  }

  const rows = (data ?? []) as unknown as DbCommunityPostReplyWithAuthor[];
  const counts = await loadInteractionCounts(
    client.supabase,
    id,
    client.user?.id ?? null,
  );

  return NextResponse.json({
    ok: true,
    replies: rows.map((row) => mapReply(row, client.user?.id ?? null)),
    replyCount: counts.replyCount,
    limit,
  });
}

export async function POST(request: Request, context: RouteContext) {
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

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parsed = parseReplyCreate(body);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: parsed.error },
      { status: 400 },
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
    const status =
      interactErr === "Sign in required"
        ? 401
        : interactErr === "Post not found"
          ? 404
          : 403;
    return NextResponse.json({ ok: false, error: interactErr }, { status });
  }

  const limited = checkRateLimit("reply_create", client.user.id);
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
    .from("community_post_replies")
    .insert({
      post_id: id,
      author_id: client.user.id,
      body: parsed.value.body,
    })
    .select(REPLY_SELECT)
    .single();

  if (error || !data) {
    const missing =
      error &&
      /community_post_replies|does not exist|schema cache/i.test(error.message);
    return NextResponse.json(
      {
        ok: false,
        error: missing
          ? "Replies table missing — apply migration 20261024220000_community_post_interactions.sql"
          : (error?.message ?? "Create failed"),
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
      reply: mapReply(
        data as unknown as DbCommunityPostReplyWithAuthor,
        client.user.id,
      ),
      replyCount: counts.replyCount,
    },
    { status: 201 },
  );
}
