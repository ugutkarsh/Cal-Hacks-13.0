/**
 * Browser geolocation helpers. Opt-in only — never invent a live position.
 */

import type { GeoPoint } from "@/types/map-entities";

export type BrowserLocationResult =
  | {
      ok: true;
      point: GeoPoint;
      label: string;
      accuracyMeters: number | null;
    }
  | { ok: false; reason: string };

export function requestBrowserLocation(
  options?: PositionOptions,
): Promise<BrowserLocationResult> {
  if (typeof window === "undefined" || !navigator.geolocation) {
    return Promise.resolve({
      ok: false,
      reason: "Geolocation is not available in this browser",
    });
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          resolve({ ok: false, reason: "Invalid coordinates from browser" });
          return;
        }
        resolve({
          ok: true,
          point: { lat: latitude, lng: longitude },
          label: `Near you · browser location (±${
            Number.isFinite(accuracy) ? Math.round(accuracy) : "?"
          } m)`,
          accuracyMeters: Number.isFinite(accuracy) ? accuracy : null,
        });
      },
      (err) => {
        resolve({
          ok: false,
          reason: err.message || "Location permission denied or unavailable",
        });
      },
      {
        enableHighAccuracy: false,
        timeout: 12_000,
        maximumAge: 60_000,
        ...options,
      },
    );
  });
}
