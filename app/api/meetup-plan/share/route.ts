/**
 * POST /api/meetup-plan/share — publish a community post from a reviewed plan.
 * Requires auth + explicit confirm:true. Never auto-publishes.
 */

import { NextResponse } from "next/server";
import {
  createInputToDbInsert,
  mapCommunityPost,
  POST_SELECT,
} from "@/lib/community/mappers";
import { parsePostCreate } from "@/lib/community/validation";
import {
  buildDraftShareMessage,
  sanitizeMeetupCriteria,
} from "@/lib/meetup-plan/extract-plan";
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
        { ok: false, error: "Sign in required to share a plan" },
        { status: 401 },
      ),
    } as const;
  }
  return { supabase, user } as const;
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const limited = checkRateLimit("post_create", auth.user.id);
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
  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }
  const o = body as Record<string, unknown>;

  if (o.confirm !== true) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Explicit confirm:true is required to share a plan as a community post",
      },
      { status: 400 },
    );
  }

  const criteria = sanitizeMeetupCriteria(o.criteria);
  if (!criteria?.activity) {
    return NextResponse.json(
      { ok: false, error: "Plan criteria with an activity are required" },
      { status: 400 },
    );
  }

  const optionName =
    typeof o.optionName === "string" ? o.optionName.trim().slice(0, 120) : null;
  const customMessage =
    typeof o.message === "string" ? o.message.trim().slice(0, 2000) : "";
  const message =
    customMessage ||
    buildDraftShareMessage(criteria, optionName) ||
    `Looking to organize a ${criteria.activity} meetup — reply if interested. Not a confirmed booking.`;

  const parsed = parsePostCreate({
    message,
    activity: criteria.activity,
    category: criteria.category,
    city: criteria.city,
    neighborhood: criteria.neighborhood,
    preferredDays: criteria.preferredDays,
    timeStartHour: criteria.timeStartHour,
    timeEndHour: criteria.timeEndHour,
    skillLevel: criteria.skillLevel,
    intent: "organize_meetup",
    visibility: "public",
  });
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: parsed.error },
      { status: 400 },
    );
  }

  const profile = await auth.supabase
    .from("profiles")
    .select("id")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (!profile.data) {
    const displayName =
      (typeof auth.user.user_metadata?.display_name === "string" &&
        auth.user.user_metadata.display_name.trim()) ||
      auth.user.email?.split("@")[0] ||
      "Trailmapper";
    const inserted = await auth.supabase.from("profiles").insert({
      id: auth.user.id,
      display_name: displayName.slice(0, 80),
    });
    if (inserted.error) {
      return NextResponse.json(
        {
          ok: false,
          error: publicApiError("Could not create profile", inserted.error),
        },
        { status: 500 },
      );
    }
  }

  const insertRow = createInputToDbInsert(parsed.value, auth.user.id);
  const { data, error } = await auth.supabase
    .from("community_posts")
    .insert(insertRow)
    .select(POST_SELECT)
    .single();

  if (error || !data) {
    return NextResponse.json(
      {
        ok: false,
        error: publicApiError("Could not share plan as post", error),
      },
      { status: 500 },
    );
  }

  const post = mapCommunityPost(data, auth.user.id);
  return NextResponse.json({
    ok: true,
    postId: post.id,
    message:
      "Community post created from your suggested plan. This is not a booking confirmation.",
    post,
  });
}
