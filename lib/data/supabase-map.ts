/**
 * Supabase public reads for the discovery map.
 * UI components must not call Supabase directly.
 */

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  mapActivityRow,
  mapDiscoverableProfile,
  mapPlaceRow,
} from "@/lib/data/mappers";
import type {
  DbActivityWithRelations,
  DbPlace,
  DbProfile,
  DbRegistrationCount,
} from "@/types/database";
import type { MapEntity } from "@/types/map-entities";

export class SupabaseMapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseMapError";
  }
}

async function fetchRegistrationCounts(
  activityIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (activityIds.length === 0) return counts;

  const client = getSupabaseBrowserClient();
  if (!client) {
    throw new SupabaseMapError("Supabase client is not configured");
  }

  const { data, error } = await client.rpc("activity_registration_counts", {
    activity_ids: activityIds,
  });

  if (error) {
    // RPC missing (migration not applied) — treat counts as zero, don't invent attendees.
    console.warn(
      "[trailmap] activity_registration_counts RPC unavailable:",
      error.message,
    );
    return counts;
  }

  for (const row of (data ?? []) as DbRegistrationCount[]) {
    if (row?.activity_id) {
      counts.set(row.activity_id, Number(row.registration_count) || 0);
    }
  }
  return counts;
}

export async function fetchMapEntitiesFromSupabase(): Promise<MapEntity[]> {
  const client = getSupabaseBrowserClient();
  if (!client) {
    throw new SupabaseMapError(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, or set NEXT_PUBLIC_DATA_SOURCE=demo.",
    );
  }

  const [placesRes, activitiesRes] = await Promise.all([
    client.from("places").select("*"),
    client
      .from("activities")
      .select(
        "id, title, description, category, place_id, organizer_id, starts_at, ends_at, capacity, image_url, source_type, source_url, source_provider, source_record_id, imported_at, last_verified_at, import_run_id, latitude, longitude, difficulty_label, location_label, host_label, cost_cents, created_at, updated_at, places(name, latitude, longitude, image_url), profiles(display_name)",
      )
      .gte("starts_at", new Date(Date.now() - 1000 * 60 * 60).toISOString())
      .order("starts_at", { ascending: true }),
  ]);

  // Prefer fuzzed public view; fall back so map keeps working pre-migration.
  let profilesData: unknown[] | null = null;
  let profilesError: string | null = null;
  {
    const primary = await client
      .from("discoverable_profiles_public")
      .select(
        "id, display_name, avatar_url, bio, city, neighborhood, discoverable, discovery_lat, discovery_lng, interests, skill_level, availability_days, availability_start_hour, availability_end_hour, preferred_radius_km, created_at",
      );
    if (!primary.error) {
      profilesData = primary.data;
    } else {
      const extended = await client
        .from("profiles")
        .select(
          "id, display_name, avatar_url, bio, city, neighborhood, discoverable, discovery_lat, discovery_lng, interests, skill_level, availability_days, availability_start_hour, availability_end_hour, preferred_radius_km, created_at",
        )
        .eq("discoverable", true);
      if (!extended.error) {
        profilesData = extended.data;
      } else {
        const legacy = await client
          .from("profiles")
          .select(
            "id, display_name, avatar_url, bio, discoverable, discovery_lat, discovery_lng, interests, created_at",
          )
          .eq("discoverable", true);
        if (legacy.error) {
          profilesError = legacy.error.message;
        } else {
          profilesData = legacy.data;
        }
      }
    }
  }

  if (placesRes.error) {
    throw new SupabaseMapError(
      `Failed to load places: ${placesRes.error.message}`,
    );
  }
  if (activitiesRes.error) {
    throw new SupabaseMapError(
      `Failed to load activities: ${activitiesRes.error.message}`,
    );
  }
  if (profilesError) {
    throw new SupabaseMapError(
      `Failed to load discoverable profiles: ${profilesError}`,
    );
  }

  const placeEntities = ((placesRes.data ?? []) as DbPlace[])
    .map(mapPlaceRow)
    .filter((e): e is NonNullable<typeof e> => e != null);

  const activityRows = (activitiesRes.data ?? []).map((raw) => {
    const row = raw as Record<string, unknown>;
    const placesRaw = row.places;
    const profilesRaw = row.profiles;
    return {
      ...(row as unknown as DbActivityWithRelations),
      places: Array.isArray(placesRaw)
        ? ((placesRaw[0] as DbActivityWithRelations["places"]) ?? null)
        : ((placesRaw as DbActivityWithRelations["places"]) ?? null),
      profiles: Array.isArray(profilesRaw)
        ? ((profilesRaw[0] as DbActivityWithRelations["profiles"]) ?? null)
        : ((profilesRaw as DbActivityWithRelations["profiles"]) ?? null),
    } satisfies DbActivityWithRelations;
  });
  const counts = await fetchRegistrationCounts(activityRows.map((a) => a.id));

  const eventEntities = activityRows
    .map((row) => mapActivityRow(row, counts.get(row.id) ?? 0))
    .filter((e): e is NonNullable<typeof e> => e != null);

  const personEntities = ((profilesData ?? []) as Partial<DbProfile>[])
    .map((row) =>
      mapDiscoverableProfile({
        id: row.id ?? "",
        display_name: row.display_name ?? "",
        avatar_url: row.avatar_url ?? null,
        bio: row.bio ?? null,
        city: row.city ?? null,
        neighborhood: row.neighborhood ?? null,
        discoverable: row.discoverable === true,
        discovery_lat: row.discovery_lat ?? null,
        discovery_lng: row.discovery_lng ?? null,
        interests: row.interests ?? [],
        skill_level: row.skill_level ?? null,
        availability_days: row.availability_days ?? [],
        availability_start_hour: row.availability_start_hour ?? null,
        availability_end_hour: row.availability_end_hour ?? null,
        preferred_radius_km: row.preferred_radius_km ?? null,
        dm_policy: row.dm_policy ?? "discoverable_only",
        created_at: row.created_at ?? new Date().toISOString(),
        updated_at: row.updated_at ?? row.created_at ?? new Date().toISOString(),
      }),
    )
    .filter((e): e is NonNullable<typeof e> => e != null);

  return [...placeEntities, ...eventEntities, ...personEntities];
}
