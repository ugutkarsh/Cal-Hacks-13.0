/**
 * Map entity data access.
 * Demo mode: labeled mock data.
 * Supabase mode: public reads via lib/data/supabase-map.ts.
 * Configured Supabase failures never silently fall back to mock.
 */

import { MOCK_MAP_ENTITIES } from "@/data/mock/map-entities";
import { dedupeMapEntities } from "@/lib/data/dedupe-entities";
import { dataSourceLabel, resolveDataSourceMode } from "@/lib/data/source";
import {
  fetchMapEntitiesFromSupabase,
  SupabaseMapError,
} from "@/lib/data/supabase-map";
import type {
  CategoryFilter,
  DataSourceMeta,
  EntityKind,
  MapDiscoveryQuery,
  MapEntity,
} from "@/types/map-entities";

export type LoadState = "idle" | "loading" | "success" | "empty" | "error";

export interface MapEntitiesResult {
  entities: MapEntity[];
  meta: DataSourceMeta;
  error: string | null;
  /** When supabase fails, UI may offer switching to demo. */
  canUseDemoFallback: boolean;
}

/** Pure filter used by the data layer and unit tests. */
export function filterMapEntity(
  entity: MapEntity,
  query: MapDiscoveryQuery,
): boolean {
  if (query.kinds.length > 0 && !query.kinds.includes(entity.kind)) {
    return false;
  }

  if (query.category !== "all" && entity.category !== query.category) {
    return false;
  }

  const q = query.search.trim().toLowerCase();
  if (!q) return true;

  const haystack = [
    entity.name,
    entity.summary,
    entity.locationLabel,
    entity.category,
    entity.kind,
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(q);
}

function filterAll(
  source: MapEntity[],
  query: MapDiscoveryQuery,
): MapEntity[] {
  return source.filter((entity) => filterMapEntity(entity, query));
}

export async function loadMapEntities(
  query: MapDiscoveryQuery = {
    search: "",
    category: "all",
    kinds: ["place", "event", "person"],
  },
  options?: { forceDemo?: boolean },
): Promise<MapEntitiesResult> {
  const mode = options?.forceDemo ? "demo" : resolveDataSourceMode();

  if (process.env.VITEST !== "true" && mode === "demo") {
    await new Promise((resolve) => setTimeout(resolve, 450));
  }

  if (mode === "demo") {
    const entities = filterAll(MOCK_MAP_ENTITIES, query);
    return {
      entities,
      meta: {
        mode: "demo",
        label: dataSourceLabel("demo"),
        fetchedAt: new Date().toISOString(),
      },
      error: null,
      canUseDemoFallback: false,
    };
  }

  try {
    const remote = await fetchMapEntitiesFromSupabase();
    const entities = filterAll(dedupeMapEntities(remote), query);
    return {
      entities,
      meta: {
        mode: "supabase",
        label: dataSourceLabel("supabase"),
        fetchedAt: new Date().toISOString(),
      },
      error: null,
      canUseDemoFallback: false,
    };
  } catch (err) {
    const message =
      err instanceof SupabaseMapError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Failed to load map entities from Supabase";

    return {
      entities: [],
      meta: {
        mode: "supabase",
        label: "Supabase error",
        fetchedAt: null,
      },
      error: message,
      canUseDemoFallback: true,
    };
  }
}

export const DEFAULT_KINDS: EntityKind[] = ["place", "event", "person"];

export const CATEGORY_OPTIONS: { value: CategoryFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "hiking", label: "Hiking" },
  { value: "cycling", label: "Cycling" },
  { value: "running", label: "Running" },
  { value: "outdoor", label: "Outdoor" },
  { value: "sports", label: "Sports" },
  { value: "meetup", label: "Meetup" },
  { value: "climbing", label: "Climbing" },
];
