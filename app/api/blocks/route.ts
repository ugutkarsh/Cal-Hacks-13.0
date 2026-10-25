/**
 * Block / unblock users. blocker_id always = auth.uid().
 */

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  checkRateLimit,
  rateLimitExceededResponse,
} from "@/lib/privacy/rate-limit";
import { publicApiError } from "@/lib/privacy/safe-error";
import { isUuid } from "@/lib/messaging/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireUser() {
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
  if (!user) {
    return {
      error: NextResponse.json(
        { ok: false, error: "Sign in required" },
        { status: 401 },
      ),
    } as const;
  }
  return { supabase, user } as const;
}

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const { data, error } = await supabase
    .from("user_blocks")
    .select("blocked_id, created_at")
    .eq("blocker_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { ok: false, error: publicApiError("Could not load blocks", error) },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    blockedUserIds: (data ?? []).map((r) => r.blocked_id as string),
  });
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const limited = checkRateLimit("block_create", user.id);
  if (!limited.ok) {
    const r = rateLimitExceededResponse(limited.retryAfterSec);
    return NextResponse.json(r.body, { status: r.status, headers: r.headers });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const peerId =
    json && typeof json === "object"
      ? (json as { userId?: unknown }).userId
      : null;
  if (!isUuid(peerId)) {
    return NextResponse.json(
      { ok: false, error: "userId must be a valid UUID" },
      { status: 400 },
    );
  }
  if (peerId === user.id) {
    return NextResponse.json(
      { ok: false, error: "Cannot block yourself" },
      { status: 400 },
    );
  }

  const { error } = await supabase.from("user_blocks").upsert(
    {
      blocker_id: user.id,
      blocked_id: peerId,
    },
    { onConflict: "blocker_id,blocked_id" },
  );

  if (error) {
    return NextResponse.json(
      { ok: false, error: publicApiError("Could not block user", error) },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const url = new URL(request.url);
  const peerId = url.searchParams.get("userId");
  if (!isUuid(peerId)) {
    return NextResponse.json(
      { ok: false, error: "userId must be a valid UUID" },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("user_blocks")
    .delete()
    .eq("blocker_id", user.id)
    .eq("blocked_id", peerId);

  if (error) {
    return NextResponse.json(
      { ok: false, error: publicApiError("Could not unblock user", error) },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
