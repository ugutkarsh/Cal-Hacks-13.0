/**
 * Authenticated activity feedback — own rows only (RLS + server auth).
 * Soft personalization signals; not a trained ML model.
 */

import { NextResponse } from "next/server";
import {
  FEEDBACK_SELECT,
  mapDbFeedback,
  type DbActivityFeedback,
} from "@/lib/feedback/mappers";
import { parseFeedbackCreate } from "@/lib/feedback/validation";
import {
  checkRateLimit,
  rateLimitExceededResponse,
} from "@/lib/privacy/rate-limit";
import { publicApiError } from "@/lib/privacy/safe-error";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

/** List own feedback (newest first). */
export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase
    .from("activity_feedback")
    .select(FEEDBACK_SELECT)
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json(
      { ok: false, error: publicApiError("Could not load feedback", error) },
      { status: 500 },
    );
  }

  const events = ((data ?? []) as DbActivityFeedback[]).map(mapDbFeedback);
  return NextResponse.json({ ok: true, events, storage: "supabase" });
}

/** Record a feedback action for the signed-in user. */
export async function POST(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const limited = checkRateLimit("feedback_create", auth.user.id);
  if (!limited.ok) {
    const r = rateLimitExceededResponse(limited.retryAfterSec);
    return NextResponse.json(r.body, { status: r.status, headers: r.headers });
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parsed = parseFeedbackCreate(body);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: parsed.error },
      { status: 400 },
    );
  }

  const { activityId, action, rating, activityCategory } = parsed.value;

  const { data, error } = await auth.supabase
    .from("activity_feedback")
    .insert({
      user_id: auth.user.id,
      activity_id: activityId,
      action,
      rating,
      activity_category: activityCategory,
    })
    .select(FEEDBACK_SELECT)
    .single();

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error: publicApiError("Could not save feedback", error),
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    event: mapDbFeedback(data as DbActivityFeedback),
    note: "Feedback saved privately for ranking adjustments (rules, not a trained model).",
  });
}

/** Clear all personalization feedback for the signed-in user. */
export async function DELETE() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const limited = checkRateLimit("feedback_clear", auth.user.id);
  if (!limited.ok) {
    const r = rateLimitExceededResponse(limited.retryAfterSec);
    return NextResponse.json(r.body, { status: r.status, headers: r.headers });
  }

  const { error } = await auth.supabase
    .from("activity_feedback")
    .delete()
    .eq("user_id", auth.user.id);

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error: publicApiError("Could not clear feedback", error),
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    cleared: true,
    note: "Personalization feedback cleared. Recommendations use baseline prefs until you save or like again.",
  });
}
