/**
 * Normalize hypebridge/find-events records → import drafts.
 * Never invent missing title, date, coordinates, or URLs.
 */

import {
  canonicalizeSourceRecordId,
  isFiniteNumber,
  mapRecreationCategory,
  parseIso,
  resolveCostCents,
  type NormalizeResult,
  type NormalizedImportDraft,
} from "@/lib/apify/import-draft";
import type { ApifyFindEventsRecord } from "@/types/apify-find-events";

function sanitizeProvider(platform: string): string {
  const slug = platform
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "find-events";
}

function extractCoords(
  record: ApifyFindEventsRecord,
): { lat: number; lng: number } | null {
  const candidates: Array<[unknown, unknown]> = [
    [record.latitude, record.longitude],
    [record.lat, record.lon],
    [record.lat, record.lng],
  ];

  const sf = record.sourceFields;
  if (sf && typeof sf === "object") {
    const venue = sf.venue;
    if (venue && typeof venue === "object") {
      const v = venue as Record<string, unknown>;
      candidates.push([v.lat, v.lon], [v.lat, v.lng], [v.latitude, v.longitude]);
    }
    candidates.push(
      [sf.latitude, sf.longitude],
      [sf.lat, sf.lon],
      [sf.lat, sf.lng],
    );
  }

  for (const [a, b] of candidates) {
    if (isFiniteNumber(a) && isFiniteNumber(b)) {
      if (a >= -90 && a <= 90 && b >= -180 && b <= 180) {
        return { lat: a, lng: b };
      }
    }
  }
  return null;
}

function formatLocationLabel(record: ApifyFindEventsRecord): string | null {
  const name =
    typeof record.venueName === "string" ? record.venueName.trim() : "";
  const address =
    typeof record.address === "string" ? record.address.trim() : "";
  const city = typeof record.city === "string" ? record.city.trim() : "";
  const state = typeof record.state === "string" ? record.state.trim() : "";
  const cityState = [city, state].filter(Boolean).join(", ");

  if (name && cityState) return `${name} · ${cityState}`;
  if (name && address) return `${name} · ${address}`;
  if (address) return address;
  if (name) return name;
  if (cityState) return cityState;
  return null;
}

function costFromRecord(record: ApifyFindEventsRecord): number | null {
  const structured =
    isFiniteNumber(record.priceMin) && record.priceMin > 0
      ? Math.round(record.priceMin * 100)
      : null;
  return resolveCostCents({
    structuredCents: structured,
    isFree: record.isFree,
    description: record.description,
  });
}

function resolveSourceRecordId(
  record: ApifyFindEventsRecord,
  provider: string,
): string | null {
  const url =
    typeof record.sourceUrl === "string" ? record.sourceUrl.trim() : "";
  return canonicalizeSourceRecordId(
    provider,
    record.id != null ? String(record.id) : null,
    url || null,
  );
}

export function normalizeFindEventsRecord(
  record: ApifyFindEventsRecord,
): NormalizeResult {
  const platformRaw =
    typeof record.platform === "string" ? record.platform.trim() : "";
  const sourceProvider = sanitizeProvider(platformRaw || "find-events");

  const sourceRecordId = resolveSourceRecordId(record, sourceProvider);
  if (!sourceRecordId) {
    return {
      ok: false,
      reason: "Missing event id and sourceUrl",
      sourceRecordId: null,
    };
  }

  const title = typeof record.title === "string" ? record.title.trim() : "";
  if (!title) {
    return { ok: false, reason: "Missing title", sourceRecordId };
  }

  const startsAt = parseIso(record.startDateTimeUtc);
  if (!startsAt) {
    return {
      ok: false,
      reason: "Missing or invalid startDateTimeUtc",
      sourceRecordId,
    };
  }

  const endsAt = parseIso(record.endDateTimeUtc);

  const coords = extractCoords(record);
  if (!coords) {
    return {
      ok: false,
      reason: "Missing venue coordinates",
      sourceRecordId,
    };
  }

  const sourceUrl =
    typeof record.sourceUrl === "string" &&
    record.sourceUrl.trim().startsWith("http")
      ? record.sourceUrl.trim()
      : null;
  if (!sourceUrl) {
    return { ok: false, reason: "Missing or invalid sourceUrl", sourceRecordId };
  }

  if (endsAt && new Date(endsAt) < new Date(startsAt)) {
    return {
      ok: false,
      reason: "endDateTimeUtc precedes startDateTimeUtc",
      sourceRecordId,
    };
  }

  const draft: NormalizedImportDraft = {
    title,
    description:
      typeof record.description === "string" ? record.description.trim() : "",
    category: mapRecreationCategory(
      [record.title, record.description, record.category, record.platform]
        .filter(Boolean)
        .join(" "),
    ),
    startsAt,
    endsAt,
    latitude: coords.lat,
    longitude: coords.lng,
    imageUrl:
      typeof record.imageUrl === "string" &&
      record.imageUrl.startsWith("http")
        ? record.imageUrl
        : null,
    sourceUrl,
    sourceRecordId,
    sourceProvider,
    sourceType: "apify",
    difficultyLabel: null,
    costCents: costFromRecord(record),
    locationLabel: formatLocationLabel(record),
    hostLabel: null,
  };

  return { ok: true, draft };
}
