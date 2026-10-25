/**
 * Map visibility rules: manual search / NL filters stay authoritative.
 * Soft preference distance must not silently hide explicit search hits.
 * Never invents coordinates — entities without coords are excluded upstream.
 */

import { distanceKm } from "@/lib/recommendations/geo";
import type { GeoPoint, MapEntity } from "@/types/map-entities";

export type DiscoveryVisibilityInput = {
  entities: MapEntity[];
  /** Soft nearby center from prefs — never exact GPS broadcast. */
  startingPoint: GeoPoint | null;
  maxDistanceKm: number;
  /** Non-empty search means catalog was already filter-matched — do not re-clip by distance. */
  searchActive: boolean;
  /** NL match ids when natural-language search confirmed. */
  nlMatchIds: Set<string> | null;
  /** When true, keep only recommended events (places/people still visible). */
  forYouOnly: boolean;
  recommendedIds: Set<string>;
};

/**
 * Build the set of entities shown on the map.
 * Order of authority: NL ids → For You (events) → soft distance (only when no search/NL).
 */
export function filterVisibleMapEntities(
  input: DiscoveryVisibilityInput,
): MapEntity[] {
  let list = input.entities;

  // Explicit NL criteria win — never silently drop matched ids for distance.
  if (input.nlMatchIds) {
    list = list.filter((e) => input.nlMatchIds!.has(e.id));
  }

  if (input.forYouOnly) {
    list = list.filter(
      (e) => e.kind !== "event" || input.recommendedIds.has(e.id),
    );
  }

  const skipDistanceClip = input.searchActive || input.nlMatchIds != null;
  if (!skipDistanceClip && input.startingPoint) {
    const placeEventMaxKm = Math.max(input.maxDistanceKm * 2, 40);
    const peopleMaxKm = Math.max(input.maxDistanceKm * 4, 100);
    const center = input.startingPoint;
    list = list.filter((e) => {
      if (
        !e.coordinates ||
        typeof e.coordinates.lat !== "number" ||
        typeof e.coordinates.lng !== "number" ||
        !Number.isFinite(e.coordinates.lat) ||
        !Number.isFinite(e.coordinates.lng)
      ) {
        return false;
      }
      const d = distanceKm(center, e.coordinates);
      return e.kind === "person" ? d <= peopleMaxKm : d <= placeEventMaxKm;
    });
  } else {
    // Still drop entities with missing/invalid coordinates (never invent pins).
    list = list.filter(
      (e) =>
        e.coordinates &&
        Number.isFinite(e.coordinates.lat) &&
        Number.isFinite(e.coordinates.lng),
    );
  }

  return list;
}

/**
 * Rank render order so selected / emphasized / high-relevance sit on top
 * when markers overlap (no invented positions — z-order only).
 */
export function sortEntitiesForMarkerStack(
  entities: MapEntity[],
  options: {
    selectedId: string | null;
    emphasizedId: string | null;
    relevanceById: Map<string, RelevanceTier>;
  },
): MapEntity[] {
  const tierRank = (id: string) => {
    const t = options.relevanceById.get(id) ?? "none";
    if (t === "high") return 3;
    if (t === "medium") return 2;
    return 1;
  };

  return [...entities].sort((a, b) => {
    const aSel = a.id === options.selectedId ? 1 : 0;
    const bSel = b.id === options.selectedId ? 1 : 0;
    if (aSel !== bSel) return aSel - bSel;
    const aEmp = a.id === options.emphasizedId ? 1 : 0;
    const bEmp = b.id === options.emphasizedId ? 1 : 0;
    if (aEmp !== bEmp) return aEmp - bEmp;
    const tr = tierRank(a.id) - tierRank(b.id);
    if (tr !== 0) return tr;
    return a.id.localeCompare(b.id);
  });
}

export type RelevanceTier = "high" | "medium" | "none";

/**
 * Map recommendation scores → visual tiers.
 * Only applies when personalization is enabled; never invents scores.
 */
export function relevanceTierFromScores(
  ranked: Array<{ activityId: string; score: number }>,
  enabled: boolean,
): Map<string, RelevanceTier> {
  const map = new Map<string, RelevanceTier>();
  if (!enabled || ranked.length === 0) return map;

  const sorted = [...ranked].sort((a, b) => b.score - a.score);
  sorted.forEach((row, index) => {
    // Top 3 or strong absolute score → high; remaining ranked → medium.
    if (index < 3 || row.score >= 40) {
      map.set(row.activityId, "high");
    } else {
      map.set(row.activityId, "medium");
    }
  });
  return map;
}
