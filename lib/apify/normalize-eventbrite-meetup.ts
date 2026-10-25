/**
 * Normalize seemuapps/eventbrite-meetup-events-scraper records → import drafts.
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
import type { ApifyEventbriteMeetupRecord } from "@/types/apify-eventbrite-meetup";

function formatLocationLabel(
  record: ApifyEventbriteMeetupRecord,
): string | null {
  const name =
    typeof record.venueName === "string" ? record.venueName.trim() : "";
  const address =
    typeof record.address === "string" ? record.address.trim() : "";
  const city = typeof record.city === "string" ? record.city.trim() : "";
  const region = typeof record.region === "string" ? record.region.trim() : "";
  const cityState = [city, region].filter(Boolean).join(", ");

  if (name && cityState) return `${name} · ${cityState}`;
  if (name && address) return `${name} · ${address}`;
  if (address) return address;
  if (name) return name;
  if (cityState) return cityState;
  return null;
}

function costFromRecord(record: ApifyEventbriteMeetupRecord): number | null {
  const structured =
    isFiniteNumber(record.minPrice) && record.minPrice > 0
      ? Math.round(record.minPrice * 100)
      : null;
  return resolveCostCents({
    structuredCents: structured,
    isFree: record.isFree,
    description: record.description,
  });
}

export function normalizeEventbriteMeetupRecord(
  record: ApifyEventbriteMeetupRecord,
): NormalizeResult {
  const rawSource =
    typeof record.source === "string" ? record.source.trim().toLowerCase() : "";
  if (rawSource !== "eventbrite" && rawSource !== "meetup") {
    return {
      ok: false,
      reason: "Missing or unsupported source (expected eventbrite|meetup)",
      sourceRecordId:
        record.eventId == null ? null : String(record.eventId).trim() || null,
    };
  }

  const sourceUrlEarly =
    typeof record.url === "string" ? record.url.trim() : "";
  const sourceRecordId = canonicalizeSourceRecordId(
    rawSource,
    record.eventId == null ? null : String(record.eventId),
    sourceUrlEarly || null,
  );
  if (!sourceRecordId) {
    return { ok: false, reason: "Missing eventId", sourceRecordId: null };
  }

  const title = typeof record.title === "string" ? record.title.trim() : "";
  if (!title) {
    return { ok: false, reason: "Missing title", sourceRecordId };
  }

  const startsAt = parseIso(record.startAt);
  if (!startsAt) {
    return { ok: false, reason: "Missing or invalid startAt", sourceRecordId };
  }

  const endsAt = parseIso(record.endAt);

  if (record.isOnline === true) {
    return {
      ok: false,
      reason: "Online-only events are skipped (map requires coordinates)",
      sourceRecordId,
    };
  }

  const lat = record.latitude;
  const lng = record.longitude;
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) {
    return {
      ok: false,
      reason: "Missing venue coordinates",
      sourceRecordId,
    };
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { ok: false, reason: "Coordinates out of range", sourceRecordId };
  }

  const sourceUrl =
    typeof record.url === "string" && record.url.startsWith("http")
      ? record.url.trim()
      : null;
  if (!sourceUrl) {
    return { ok: false, reason: "Missing or invalid source URL", sourceRecordId };
  }

  if (endsAt && new Date(endsAt) < new Date(startsAt)) {
    return { ok: false, reason: "endAt precedes startAt", sourceRecordId };
  }

  const hostLabel =
    typeof record.organizerName === "string" && record.organizerName.trim()
      ? record.organizerName.trim()
      : null;

  const draft: NormalizedImportDraft = {
    title,
    description:
      typeof record.description === "string" ? record.description.trim() : "",
    category: mapRecreationCategory(
      [
        record.title,
        record.description,
        record.category,
        record.keyword,
        ...(Array.isArray(record.tags) ? record.tags : []),
      ]
        .filter(Boolean)
        .join(" "),
    ),
    startsAt,
    endsAt,
    latitude: lat,
    longitude: lng,
    imageUrl:
      typeof record.imageUrl === "string" && record.imageUrl.startsWith("http")
        ? record.imageUrl
        : null,
    sourceUrl,
    sourceRecordId,
    sourceProvider: rawSource,
    sourceType: "apify",
    difficultyLabel: null,
    costCents: costFromRecord(record),
    locationLabel: formatLocationLabel(record),
    hostLabel,
  };

  return { ok: true, draft };
}
