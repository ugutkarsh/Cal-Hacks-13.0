/**
 * Normalize crawlerbros/eventbrite-scraper records → import drafts.
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
import type { ApifyEventbriteOnlyRecord } from "@/types/apify-eventbrite-only";

const SOURCE_PROVIDER = "eventbrite";

function pickString(...values: unknown[]): string {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function extractCoords(
  record: ApifyEventbriteOnlyRecord,
): { lat: number; lng: number } | null {
  const pairs: Array<[unknown, unknown]> = [
    [record.latitude, record.longitude],
    [record.lat, record.lng],
    [record.lat, record.lon],
  ];
  for (const [a, b] of pairs) {
    if (isFiniteNumber(a) && isFiniteNumber(b)) {
      if (a >= -90 && a <= 90 && b >= -180 && b <= 180) {
        return { lat: a, lng: b };
      }
    }
  }
  return null;
}

function resolveSourceRecordId(record: ApifyEventbriteOnlyRecord): string | null {
  const url = pickString(record.url, record.ticketUrl);
  return canonicalizeSourceRecordId(
    "eventbrite",
    record.id != null
      ? String(record.id)
      : record.eventId != null
        ? String(record.eventId)
        : null,
    url,
  );
}

function costFromRecord(record: ApifyEventbriteOnlyRecord): number | null {
  let structured: number | null = null;
  if (isFiniteNumber(record.minPrice) && record.minPrice > 0) {
    structured = Math.round(record.minPrice * 100);
  } else if (isFiniteNumber(record.price) && record.price > 0) {
    structured = Math.round(record.price * 100);
  }
  return resolveCostCents({
    structuredCents: structured,
    isFree: record.isFree,
    description: record.description,
  });
}

function formatLocationLabel(record: ApifyEventbriteOnlyRecord): string | null {
  const name = pickString(record.venueName, record.venue);
  const address = pickString(record.address);
  const city = pickString(record.city);
  if (name && city) return `${name} · ${city}`;
  if (name && address) return `${name} · ${address}`;
  if (address) return address;
  if (name) return name;
  if (city) return city;
  return null;
}

export function normalizeEventbriteOnlyRecord(
  record: ApifyEventbriteOnlyRecord,
): NormalizeResult {
  const sourceRecordId = resolveSourceRecordId(record);
  if (!sourceRecordId) {
    return {
      ok: false,
      reason: "Missing event id and url",
      sourceRecordId: null,
    };
  }

  const title = pickString(record.title, record.name);
  if (!title) {
    return { ok: false, reason: "Missing title", sourceRecordId };
  }

  const startsAt = parseIso(
    pickString(record.startDate, record.start, record.startsAt) || null,
  );
  if (!startsAt) {
    return {
      ok: false,
      reason: "Missing or invalid start date",
      sourceRecordId,
    };
  }

  const endsAt = parseIso(
    pickString(record.endDate, record.end, record.endsAt) || null,
  );

  if (record.isOnline === true) {
    return {
      ok: false,
      reason: "Online-only events are skipped (map requires coordinates)",
      sourceRecordId,
    };
  }

  const coords = extractCoords(record);
  if (!coords) {
    return {
      ok: false,
      reason: "Missing venue coordinates",
      sourceRecordId,
    };
  }

  const sourceUrl = pickString(record.url, record.ticketUrl);
  if (!sourceUrl.startsWith("http")) {
    return {
      ok: false,
      reason: "Missing or invalid source URL",
      sourceRecordId,
    };
  }

  if (endsAt && new Date(endsAt) < new Date(startsAt)) {
    return {
      ok: false,
      reason: "end date precedes start date",
      sourceRecordId,
    };
  }

  const imageCandidate = pickString(record.imageUrl, record.image);
  const tags = Array.isArray(record.tags)
    ? record.tags.filter((t): t is string => typeof t === "string").join(" ")
    : "";

  const draft: NormalizedImportDraft = {
    title,
    description:
      typeof record.description === "string" ? record.description.trim() : "",
    category: mapRecreationCategory(
      [title, record.description, record.category, tags].filter(Boolean).join(" "),
    ),
    startsAt,
    endsAt,
    latitude: coords.lat,
    longitude: coords.lng,
    imageUrl: imageCandidate.startsWith("http") ? imageCandidate : null,
    sourceUrl,
    sourceRecordId,
    sourceProvider: SOURCE_PROVIDER,
    sourceType: "apify",
    difficultyLabel: null,
    costCents: costFromRecord(record),
    locationLabel: formatLocationLabel(record),
    hostLabel: pickString(record.organizerName, record.organizer) || null,
  };

  return { ok: true, draft };
}
