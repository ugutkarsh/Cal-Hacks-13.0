/**
 * Server-only Nominatim geocode (city / address → lat/lng).
 * Used by RunSignup ingest when race rows lack coordinates.
 */

type NominatimHit = {
  lat?: string;
  lon?: string;
  display_name?: string;
};

export type NominatimCoords = {
  lat: number;
  lng: number;
  label: string;
};

const cache = new Map<string, NominatimCoords | null>();

export async function geocodeQueryServer(
  query: string,
): Promise<NominatimCoords | null> {
  const q = query.trim();
  if (q.length < 2) return null;

  const key = q.toLowerCase();
  if (cache.has(key)) return cache.get(key) ?? null;

  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", q);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");

    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Trailmap/1.0 (Cal Hacks demo; RunSignup city geocode)",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      cache.set(key, null);
      return null;
    }

    const hits = (await res.json()) as NominatimHit[];
    const first = hits?.[0];
    const lat = Number(first?.lat);
    const lng = Number(first?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      cache.set(key, null);
      return null;
    }

    const result: NominatimCoords = {
      lat,
      lng,
      label: (first?.display_name ?? q).trim(),
    };
    cache.set(key, result);
    return result;
  } catch {
    cache.set(key, null);
    return null;
  }
}

type NominatimReverseHit = {
  display_name?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    state?: string;
    state_code?: string;
    country_code?: string;
  };
};

/**
 * Reverse-geocode lat/lng → a short place label Apify Actors understand
 * (e.g. "Oakland, California").
 */
export async function reverseGeocodeServer(
  lat: number,
  lng: number,
): Promise<string | null> {
  const key = `rev:${lat.toFixed(3)},${lng.toFixed(3)}`;
  const cached = cache.get(key);
  if (cached) return cached.label;

  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lng));
    url.searchParams.set("format", "json");
    url.searchParams.set("zoom", "10");

    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Trailmap/1.0 (Cal Hacks demo; nearby ingest reverse geocode)",
      },
      cache: "no-store",
    });

    if (!res.ok) return null;

    const hit = (await res.json()) as NominatimReverseHit;
    const addr = hit.address;
    const city =
      addr?.city ||
      addr?.town ||
      addr?.village ||
      addr?.municipality ||
      addr?.county ||
      "";
    const state = addr?.state || addr?.state_code || "";
    const short = [city, state].filter(Boolean).join(", ");
    const label = (short || hit.display_name || "").trim();
    if (!label) return null;

    cache.set(key, { lat, lng, label });
    return label;
  } catch {
    return null;
  }
}

/** Prefer a user-typed city label; fall back to reverse geocode. */
export async function resolvePlaceLabelForIngest(input: {
  lat: number;
  lng: number;
  locationLabel?: string | null;
}): Promise<string> {
  const raw = input.locationLabel?.trim() ?? "";
  // Skip demo / browser status labels — those are not searchable city names.
  const looksLikePlace =
    raw.length >= 2 &&
    !/^demo pin/i.test(raw) &&
    !/not live/i.test(raw) &&
    !/approximate/i.test(raw) &&
    !/^browser/i.test(raw);

  if (looksLikePlace) {
    // Nominatim full labels are long; take the first two comma segments when present.
    const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) return `${parts[0]}, ${parts[1]}`;
    return raw;
  }

  const reversed = await reverseGeocodeServer(input.lat, input.lng);
  if (reversed) return reversed;

  return `${input.lat.toFixed(4)},${input.lng.toFixed(4)}`;
}
