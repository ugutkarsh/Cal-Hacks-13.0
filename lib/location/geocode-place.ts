/**
 * Client helper: resolve a typed place name via /api/geocode.
 */

export type GeocodePlaceResult =
  | {
      ok: true;
      label: string;
      lat: number;
      lng: number;
      alternatives: Array<{ label: string; lat: number; lng: number }>;
    }
  | { ok: false; error: string };

export async function geocodePlaceName(query: string): Promise<GeocodePlaceResult> {
  const q = query.trim();
  if (q.length < 2) {
    return { ok: false, error: "Enter a city or place name." };
  }

  try {
    const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
    const data = (await res.json()) as {
      ok?: boolean;
      error?: string;
      results?: Array<{ label: string; lat: number; lng: number }>;
    };

    if (!data.ok || !data.results?.length) {
      return {
        ok: false,
        error: data.error ?? "No matching place found",
      };
    }

    const [first, ...rest] = data.results;
    return {
      ok: true,
      label: first.label,
      lat: first.lat,
      lng: first.lng,
      alternatives: rest,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Geocode request failed",
    };
  }
}
