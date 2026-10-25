/**
 * Public profile by id.
 * Owners receive the full own projection; others only discoverable public fields.
 */

import { NextResponse } from "next/server";
import { mapOwnProfile, mapPublicProfile } from "@/lib/profiles/mappers";
import { normalizeProfileRow } from "@/lib/profiles/normalize";
import {
  isMissingColumnError,
  PROFILE_SELECT_FULL,
  PROFILE_SELECT_LEGACY,
} from "@/lib/profiles/select";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json(
      { ok: false, error: "Invalid profile id" },
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

  let result = await supabase
    .from("profiles")
    .select(PROFILE_SELECT_FULL)
    .eq("id", id)
    .maybeSingle();
  if (result.error && isMissingColumnError(result.error.message)) {
    result = await supabase
      .from("profiles")
      .select(PROFILE_SELECT_LEGACY)
      .eq("id", id)
      .maybeSingle();
  }

  if (result.error) {
    return NextResponse.json(
      { ok: false, error: result.error.message },
      { status: 500 },
    );
  }

  if (!result.data) {
    return NextResponse.json(
      { ok: false, error: "Profile not found" },
      { status: 404 },
    );
  }

  const row = normalizeProfileRow(result.data as Record<string, unknown>);

  if (user?.id === row.id) {
    return NextResponse.json({
      ok: true,
      kind: "own",
      profile: mapOwnProfile(row),
    });
  }

  const pub = mapPublicProfile(row);
  if (!pub) {
    return NextResponse.json(
      { ok: false, error: "Profile not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    kind: "public",
    profile: pub,
  });
}
