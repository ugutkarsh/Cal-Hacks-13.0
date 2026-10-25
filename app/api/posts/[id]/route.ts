/**
 * Single community post read / update / delete.
 * Mutations require auth.uid() === owner_id (RLS + explicit filter).
 */

import { NextResponse } from "next/server";
import { loadInteractionCounts } from "@/lib/community/interaction-counts";
import {
  mapCommunityPost,
  POST_SELECT,
  updateInputToDbPatch,
} from "@/lib/community/mappers";
import { parsePostUpdate } from "@/lib/community/validation";
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

  const { data, error } = await client.supabase
    .from("community_posts")
    .select(POST_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json(
      { ok: false, error: "Post not found" },
      { status: 404 },
    );
  }

  const viewerId = client.user?.id ?? null;
  const post = mapCommunityPost(
    data as unknown as DbCommunityPostWithAuthor,
    viewerId,
  );
  const counts = await loadInteractionCounts(client.supabase, id, viewerId);

  return NextResponse.json({
    ok: true,
    post: {
      ...post,
      interestCount: counts.interestCount,
      replyCount: counts.replyCount,
      viewerInterested: counts.viewerInterested,
    },
  });
}

export async function PATCH(request: Request, context: RouteContext) {
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

  const parsed = parsePostUpdate(body);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: parsed.error },
      { status: 400 },
    );
  }

  const patch = updateInputToDbPatch(parsed.value);
  // Never allow reassignment via body.
  delete patch.owner_id;
  delete patch.id;

  const { data, error } = await client.supabase
    .from("community_posts")
    .update(patch)
    .eq("id", id)
    .eq("owner_id", client.user.id)
    .select(POST_SELECT)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json(
      { ok: false, error: "Post not found or not owned by you" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    post: mapCommunityPost(
      data as unknown as DbCommunityPostWithAuthor,
      client.user.id,
    ),
  });
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

  const { data, error } = await client.supabase
    .from("community_posts")
    .delete()
    .eq("id", id)
    .eq("owner_id", client.user.id)
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
      { ok: false, error: "Post not found or not owned by you" },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, deletedId: data.id });
}
