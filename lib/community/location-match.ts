/**
 * Keep post recommendations near the author's stated city.
 * Prefer geocoded radius; also accept same-city label matches.
 */

import { distanceKm } from "@/lib/recommendations/geo";
import type { GeoPoint } from "@/types/map-entities";

/** Default metro radius when the post does not set radiusKm. */
export const DEFAULT_POST_RADIUS_KM = 35;

export function cityNeedle(city: string | null | undefined): string | null {
  if (!city || typeof city !== "string") return null;
  const raw = city.trim().toLowerCase();
  if (!raw) return null;
  // "San Francisco, CA" → "san francisco"
  const beforeComma = raw.split(",")[0]?.trim() ?? raw;
  return beforeComma || null;
}

export function textMentionsCity(
  haystack: string,
  city: string | null | undefined,
): boolean {
  const needle = cityNeedle(city);
  if (!needle) return false;
  return haystack.toLowerCase().includes(needle);
}

export type LocalityCheck = {
  ok: boolean;
  km: number | null;
  sameCityLabel: boolean;
  reason: string | null;
};

/**
 * True when the candidate is near the post city.
 * - With searchCenter: must be within radiusKm (default 35).
 * - Same-city label can still pass if coords are missing on the candidate
 *   (not used when coords exist and are far).
 * - Without searchCenter but with city: require city string in location text.
 */
export function isNearPostLocality(input: {
  coordinates: GeoPoint | null | undefined;
  locationText: string;
  city: string | null | undefined;
  searchCenter: GeoPoint | null | undefined;
  radiusKm: number | null | undefined;
}): LocalityCheck {
  const radius = input.radiusKm ?? DEFAULT_POST_RADIUS_KM;
  const sameCityLabel = textMentionsCity(input.locationText, input.city);
  const center = input.searchCenter;
  const coords = input.coordinates;

  if (center && coords) {
    const km = distanceKm(center, coords);
    if (km <= radius) {
      return {
        ok: true,
        km,
        sameCityLabel,
        reason: sameCityLabel
          ? `In/near ${cityNeedle(input.city)} (~${km.toFixed(1)} km)`
          : `About ${km.toFixed(1)} km from ${cityNeedle(input.city) ?? "your post city"}`,
      };
    }
    return {
      ok: false,
      km,
      sameCityLabel,
      reason: null,
    };
  }

  if (input.city) {
    if (sameCityLabel) {
      return {
        ok: true,
        km: null,
        sameCityLabel: true,
        reason: `Location label mentions ${cityNeedle(input.city)}`,
      };
    }
    return { ok: false, km: null, sameCityLabel: false, reason: null };
  }

  // No city on the post — cannot enforce locality; allow with note.
  return {
    ok: true,
    km: null,
    sameCityLabel: false,
    reason: "Post has no city — locality not filtered",
  };
}
