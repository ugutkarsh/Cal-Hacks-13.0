/**
 * Community posts list + create.
 * Ownership always comes from auth.uid() — body.ownerId is ignored.
 */

import { NextResponse } from "next/server";
import {
  createInputToDbInsert,
  mapCommunityPost,
  POST_SELECT,
} from "@/lib/community/mappers";
import { parsePostListQuery } from "@/lib/community/query";
import { parsePostCreate } from "@/lib/community/validation";
import {
  checkRateLimit,
  rateLimitExceededResponse,
} from "@/lib/privacy/rate-limit";
import { publicApiError } from "@/lib/privacy/safe-error";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { DbCommunityPostWithAuthor } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getOptionalUser(supabase: SupabaseClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

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
  const user = await getOptionalUser(supabase);
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

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Supabase is not configured" },
      { status: 503 },
    );
  }

  const user = await getOptionalUser(supabase);
  const url = new URL(request.url);
  const q = parsePostListQuery(url.searchParams);

  if (q.mine && !user) {
    return NextResponse.json(
      { ok: false, error: "Sign in required to list your posts" },
      { status: 401 },
    );
  }

  // Fetch limit+1 to detect a next page without counting the whole table.
  let query = supabase
    .from("community_posts")
    .select(POST_SELECT)
    .eq("status", q.status)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(q.limit + 1);

  if (q.mine && user) {
    query = query.eq("owner_id", user.id);
  }
  if (q.activity) {
    query = query.ilike("activity", `%${q.activity}%`);
  }
  if (q.city) {
    query = query.ilike("city", `%${q.city}%`);
  }
  if (q.neighborhood) {
    query = query.ilike("neighborhood", `%${q.neighborhood}%`);
  }
  if (q.category) {
    query = query.eq("category", q.category);
  }
  if (q.intent) {
    query = query.eq("intent", q.intent);
  }
  if (q.days.length > 0) {
    query = query.overlaps("preferred_days", q.days);
  }
  if (q.cursorCreatedAt && q.cursorId) {
    // Keyset: (created_at, id) < cursor in desc order.
    query = query.or(
      `created_at.lt.${q.cursorCreatedAt},and(created_at.eq.${q.cursorCreatedAt},id.lt.${q.cursorId})`,
    );
  }

  const { data, error } = await query;

  if (error) {
    const missing =
      /community_posts|does not exist|schema cache/i.test(error.message);
    return NextResponse.json(
      {
        ok: false,
        error: missing
          ? "Community posts table missing — apply migration 20261024210000_community_posts.sql"
          : error.message,
      },
      { status: missing ? 503 : 500 },
    );
  }

  const rows = (data ?? []) as unknown as DbCommunityPostWithAuthor[];
  const hasMore = rows.length > q.limit;
  const page = hasMore ? rows.slice(0, q.limit) : rows;
  const last = page[page.length - 1];
  const viewerId = user?.id ?? null;

  return NextResponse.json({
    ok: true,
    posts: page.map((row) => mapCommunityPost(row, viewerId)),
    nextCursor:
      hasMore && last
        ? { createdAt: last.created_at, id: last.id }
        : null,
    limit: q.limit,
  });
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

  const parsed = parsePostCreate(body);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: parsed.error },
      { status: 400 },
    );
  }

  // Ensure profile row exists (FK) — bootstrap if needed.
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

  // Owner always from session — never from body.ownerId / body.userId.
  const insertRow = createInputToDbInsert(parsed.value, auth.user.id);

  const { data, error } = await auth.supabase
    .from("community_posts")
    .insert(insertRow)
    .select(POST_SELECT)
    .single();

  if (error || !data) {
    const missing =
      error &&
      /community_posts|does not exist|schema cache/i.test(error.message);
    return NextResponse.json(
      {
        ok: false,
        error: missing
          ? "Community posts table missing — apply migration 20261024210000_community_posts.sql"
          : publicApiError("Create failed", error),
      },
      { status: missing ? 503 : 500 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      post: mapCommunityPost(
        data as unknown as DbCommunityPostWithAuthor,
        auth.user.id,
      ),
    },
    { status: 201 },
  );
}
