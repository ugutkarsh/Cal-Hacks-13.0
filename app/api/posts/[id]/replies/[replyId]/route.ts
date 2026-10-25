/**
 * Delete own reply. author_id always from auth.uid().
 */

import { NextResponse } from "next/server";
import { loadInteractionCounts } from "@/lib/community/interaction-counts";
import {
  assertReadable,
  loadPostAccess,
} from "@/lib/community/post-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; replyId: string }> };

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id, replyId } = await context.params;
  if (!isUuid(id) || !isUuid(replyId)) {
    return NextResponse.json(
      { ok: false, error: "Invalid id" },
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
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Sign in required" },
      { status: 401 },
    );
  }

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

  const { data, error } = await supabase
    .from("community_post_replies")
    .delete()
    .eq("id", replyId)
    .eq("post_id", id)
    .eq("author_id", user.id)
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
      { ok: false, error: "Reply not found or not owned by you" },
      { status: 404 },
    );
  }

  const counts = await loadInteractionCounts(supabase, id, user.id);

  return NextResponse.json({
    ok: true,
    deletedId: data.id,
    replyCount: counts.replyCount,
  });
}
