import { NextResponse } from "next/server";
import {
  queryRequestsNonUs,
  rankGeocodeCandidates,
  type GeocodeCandidate,
} from "@/lib/location/geocode-rank";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type NominatimHit = {
  lat?: string;
  lon?: string;
  display_name?: string;
  importance?: number;
  address?: {
    country_code?: string;
    city?: string;
    town?: string;
    village?: string;
    state?: string;
  };
};

/**
 * Resolve a place name → coordinates for preference / discovery pins.
 * Defaults to US-biased Nominatim results so short names don't jump to Ecuador.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json(
      { ok: false, error: "Enter a city or place name (at least 2 characters)." },
      { status: 400 },
    );
  }

  try {
    const allowWorld = queryRequestsNonUs(q);
    const url = new URL("https://nominatim.openstreetmap.org/search");
    // Prefer US for Trailmap unless the query names another country.
    let searchQ = q;
    if (!allowWorld && !/\bunited states\b|\busa\b|\b,?\s*us\b/i.test(q)) {
      searchQ = `${q}, USA`;
    }
    url.searchParams.set("q", searchQ);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "8");
    url.searchParams.set("addressdetails", "1");
    if (!allowWorld) {
      url.searchParams.set("countrycodes", "us");
    }

    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Trailmap/1.0 (Cal Hacks demo; location preference geocode)",
      },
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `Geocoder unavailable (${res.status})` },
        { status: 502 },
      );
    }

    const hits = (await res.json()) as NominatimHit[];
    const mapped: GeocodeCandidate[] = [];
    for (const h of hits ?? []) {
      const lat = Number(h.lat);
      const lng = Number(h.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      mapped.push({
        label: (h.display_name ?? q).trim(),
        lat,
        lng,
        countryCode: h.address?.country_code ?? null,
        importance: typeof h.importance === "number" ? h.importance : null,
      });
    }

    const ranked = rankGeocodeCandidates(mapped, q);
    const results = ranked.map(({ label, lat, lng }) => ({ label, lat, lng }));

    if (results.length === 0) {
      return NextResponse.json({
        ok: false,
        error:
          'No matching US place found. Try “Oakland, CA” or “Stockton, California”.',
      });
    }

    return NextResponse.json({ ok: true, results, biasedToUs: !allowWorld });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Geocode failed",
      },
      { status: 500 },
    );
  }
}
