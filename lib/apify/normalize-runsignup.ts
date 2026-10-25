/**
 * Normalize hypebridge/runsignup-race-scraper records → import drafts.
 * Coordinates often missing — caller may pass Nominatim-resolved city coords.
 */

import {
  isFiniteNumber,
  mapRecreationCategory,
  parseIso,
  type NormalizeResult,
  type NormalizedImportDraft,
} from "@/lib/apify/import-draft";
import type { ApifyRunsignupRecord } from "@/types/apify-runsignup";

const SOURCE_PROVIDER = "runsignup";

export function runsignupGeocodeQuery(
  record: ApifyRunsignupRecord,
): string | null {
  const addr = record.address;
  if (!addr || typeof addr !== "object") return null;
  const city = typeof addr.city === "string" ? addr.city.trim() : "";
  const state = typeof addr.state === "string" ? addr.state.trim() : "";
  const zip = typeof addr.zip === "string" ? addr.zip.trim() : "";
  const country =
    typeof addr.countryCode === "string" ? addr.countryCode.trim() : "US";
  const parts = [city, state, zip, country].filter(Boolean);
  return parts.length >= 2 ? parts.join(", ") : null;
}

function extractCoords(
  record: ApifyRunsignupRecord,
  fallback: { lat: number; lng: number } | null,
): { lat: number; lng: number } | null {
  if (
    isFiniteNumber(record.latitude) &&
    isFiniteNumber(record.longitude) &&
    record.latitude >= -90 &&
    record.latitude <= 90 &&
    record.longitude >= -180 &&
    record.longitude <= 180
  ) {
    return { lat: record.latitude, lng: record.longitude };
  }
  return fallback;
}

function formatLocationLabel(record: ApifyRunsignupRecord): string | null {
  const addr = record.address;
  if (!addr) return null;
  const street = typeof addr.street === "string" ? addr.street.trim() : "";
  const city = typeof addr.city === "string" ? addr.city.trim() : "";
  const state = typeof addr.state === "string" ? addr.state.trim() : "";
  const cityState = [city, state].filter(Boolean).join(", ");
  if (street && cityState) return `${street} · ${cityState}`;
  if (cityState) return cityState;
  if (street) return street;
  return null;
}

function resolveCostCents(record: ApifyRunsignupRecord): number | null {
  if (isFiniteNumber(record.minCurrentPrice)) {
    return Math.round(record.minCurrentPrice * 100);
  }
  const first = record.events?.find((e) => isFiniteNumber(e.currentPrice));
  if (first && isFiniteNumber(first.currentPrice)) {
    return Math.round(first.currentPrice * 100);
  }
  return null;
}

function descriptionFrom(record: ApifyRunsignupRecord): string {
  if (typeof record.description === "string" && record.description.trim()) {
    return record.description.trim();
  }
  const sections = record.infoSections;
  if (sections && typeof sections === "object") {
    const bits = Object.values(sections)
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .slice(0, 3);
    if (bits.length) return bits.join("\n\n").slice(0, 4000);
  }
  const distances = (record.events ?? [])
    .map((e) => [e.name, e.distance].filter(Boolean).join(" — "))
    .filter(Boolean);
  return distances.length ? distances.join("; ") : "";
}

export function normalizeRunsignupRecord(
  record: ApifyRunsignupRecord,
  options?: { coords?: { lat: number; lng: number } | null },
): NormalizeResult {
  const sourceRecordId =
    record.raceId != null && String(record.raceId).trim()
      ? String(record.raceId).trim()
      : null;

  if (!sourceRecordId) {
    return {
      ok: false,
      reason: "Missing raceId",
      sourceRecordId: null,
    };
  }

  const title = typeof record.name === "string" ? record.name.trim() : "";
  if (!title) {
    return { ok: false, reason: "Missing race name", sourceRecordId };
  }

  const startsAt = parseIso(record.nextDate);
  if (!startsAt) {
    return {
      ok: false,
      reason: "Missing or invalid nextDate",
      sourceRecordId,
    };
  }

  const coords = extractCoords(record, options?.coords ?? null);
  if (!coords) {
    return {
      ok: false,
      reason: "Missing coordinates (no lat/lng and city geocode failed)",
      sourceRecordId,
    };
  }

  const sourceUrl =
    typeof record.url === "string" && record.url.trim().startsWith("http")
      ? record.url.trim()
      : null;
  if (!sourceUrl) {
    return {
      ok: false,
      reason: "Missing or invalid race url",
      sourceRecordId,
    };
  }

  const draft: NormalizedImportDraft = {
    title,
    description: descriptionFrom(record),
    category: mapRecreationCategory(
      [
        title,
        descriptionFrom(record),
        ...(record.events ?? []).map((e) =>
          [e.name, e.distance].filter(Boolean).join(" "),
        ),
        "running race marathon 5k",
      ]
        .filter(Boolean)
        .join(" "),
    ),
    startsAt,
    endsAt: null,
    latitude: coords.lat,
    longitude: coords.lng,
    imageUrl: null,
    sourceUrl,
    sourceRecordId,
    sourceProvider: SOURCE_PROVIDER,
    sourceType: "apify",
    difficultyLabel: null,
    costCents: resolveCostCents(record),
    locationLabel: formatLocationLabel(record),
    hostLabel: null,
  };

  return { ok: true, draft };
}
