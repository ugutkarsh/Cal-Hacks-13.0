/**
 * Own profile read / update.
 * Ownership is always auth.uid() — client-supplied ids are ignored.
 */

import { NextResponse } from "next/server";
import {
  mapOwnProfile,
  ownProfileToDbPatch,
} from "@/lib/profiles/mappers";
import { normalizeProfileRow } from "@/lib/profiles/normalize";
import {
  isMissingColumnError,
  PROFILE_SELECT_FULL,
  PROFILE_SELECT_LEGACY,
} from "@/lib/profiles/select";
import {
  assertDiscoverableCoords,
  parseProfileUpdate,
} from "@/lib/profiles/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadOwnRow(supabase: SupabaseClient, userId: string) {
  const full = await supabase
    .from("profiles")
    .select(PROFILE_SELECT_FULL)
    .eq("id", userId)
    .maybeSingle();
  if (!full.error) return full;
  if (!isMissingColumnError(full.error.message)) return full;
  return supabase
    .from("profiles")
    .select(PROFILE_SELECT_LEGACY)
    .eq("id", userId)
    .maybeSingle();
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
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
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

  const { data, error } = await loadOwnRow(auth.supabase, auth.user.id);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }

  if (!data) {
    // Trigger may not have run yet — create a minimal own row.
    const displayName =
      (typeof auth.user.user_metadata?.display_name === "string" &&
        auth.user.user_metadata.display_name.trim()) ||
      auth.user.email?.split("@")[0] ||
      "Trailmapper";
    const inserted = await auth.supabase
      .from("profiles")
      .insert({ id: auth.user.id, display_name: displayName.slice(0, 80) })
      .select(PROFILE_SELECT_LEGACY)
      .single();
    if (inserted.error || !inserted.data) {
      return NextResponse.json(
        {
          ok: false,
          error:
            inserted.error?.message ??
            "Profile row missing — apply profiles migration and retry",
        },
        { status: 500 },
      );
    }
    return NextResponse.json({
      ok: true,
      profile: mapOwnProfile(
        normalizeProfileRow(inserted.data as Record<string, unknown>),
      ),
      migrationPending: true,
    });
  }

  return NextResponse.json({
    ok: true,
    profile: mapOwnProfile(normalizeProfileRow(data as Record<string, unknown>)),
  });
}

export async function PATCH(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parsed = parseProfileUpdate(body);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: parsed.error },
      { status: 400 },
    );
  }

  // Load current row so discoverable+coords can be validated after merge.
  const { data: current, error: loadError } = await loadOwnRow(
    auth.supabase,
    auth.user.id,
  );

  if (loadError) {
    return NextResponse.json(
      { ok: false, error: loadError.message },
      { status: 500 },
    );
  }
  if (!current) {
    return NextResponse.json(
      { ok: false, error: "Profile not found — sign out and sign in again" },
      { status: 404 },
    );
  }

  const own = mapOwnProfile(
    normalizeProfileRow(current as Record<string, unknown>),
  );
  const merged = {
    discoverable:
      parsed.value.discoverable !== undefined
        ? parsed.value.discoverable
        : own.discoverable,
    discoveryLat:
      parsed.value.discoveryLat !== undefined
        ? parsed.value.discoveryLat
        : own.discoveryLat,
    discoveryLng:
      parsed.value.discoveryLng !== undefined
        ? parsed.value.discoveryLng
        : own.discoveryLng,
    locationShareLevel:
      parsed.value.locationShareLevel !== undefined
        ? parsed.value.locationShareLevel
        : own.locationShareLevel,
  };
  const coordError = assertDiscoverableCoords(merged);
  if (coordError) {
    return NextResponse.json(
      { ok: false, error: coordError },
      { status: 400 },
    );
  }

  const patch = ownProfileToDbPatch(parsed.value);
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({
      ok: true,
      profile: own,
    });
  }

  // Ownership: filter always uses auth.user.id — never body.id.
  let updated = await auth.supabase
    .from("profiles")
    .update(patch)
    .eq("id", auth.user.id)
    .select(PROFILE_SELECT_FULL)
    .single();

  if (updated.error && isMissingColumnError(updated.error.message)) {
    // Pre-migration DB: only persist columns that already exist.
    const legacyPatch: Record<string, unknown> = {};
    for (const key of [
      "display_name",
      "avatar_url",
      "bio",
      "discoverable",
      "discovery_lat",
      "discovery_lng",
      "interests",
    ]) {
      if (key in patch) legacyPatch[key] = patch[key];
    }
    updated = await auth.supabase
      .from("profiles")
      .update(legacyPatch)
      .eq("id", auth.user.id)
      .select(PROFILE_SELECT_LEGACY)
      .single();
  }

  if (updated.error || !updated.data) {
    return NextResponse.json(
      {
        ok: false,
        error: updated.error?.message ?? "Update failed",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    profile: mapOwnProfile(
      normalizeProfileRow(updated.data as Record<string, unknown>),
    ),
  });
}
