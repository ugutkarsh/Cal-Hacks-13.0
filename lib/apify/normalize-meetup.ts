/**
 * Normalize Meetup Events Scraper (Apify) records → Trailmap activity drafts.
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
import type { ApifyMeetupEventRecord } from "@/types/apify-meetup";

export type { NormalizedImportDraft, NormalizeResult };

function mapCategory(record: ApifyMeetupEventRecord) {
  return mapRecreationCategory(
    [
      record.title,
      record.description,
      record.query,
      ...(record.topics ?? []).map((t) => t?.name ?? ""),
    ]
      .join(" ")
      .toLowerCase(),
  );
}

export function normalizeMeetupRecord(
  record: ApifyMeetupEventRecord,
): NormalizeResult {
  const sourceUrl =
    typeof record.url === "string" && record.url.startsWith("http")
      ? record.url.trim()
      : null;
  const sourceRecordId = canonicalizeSourceRecordId(
    "meetup",
    record.id == null ? null : String(record.id),
    sourceUrl,
  );

  if (!sourceRecordId) {
    return { ok: false, reason: "Missing source event id", sourceRecordId: null };
  }

  const title = typeof record.title === "string" ? record.title.trim() : "";
  if (!title) {
    return { ok: false, reason: "Missing title", sourceRecordId };
  }

  const startsAt = parseIso(record.dateTime);
  if (!startsAt) {
    return { ok: false, reason: "Missing or invalid dateTime", sourceRecordId };
  }

  const endsAt = parseIso(record.endTime);

  if (record.isOnline === true || record.eventType === "ONLINE") {
    return {
      ok: false,
      reason: "Online-only events are skipped (map requires coordinates)",
      sourceRecordId,
    };
  }

  const lat = record.venue?.lat;
  const lng = record.venue?.lon;
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

  if (!sourceUrl) {
    return { ok: false, reason: "Missing or invalid source URL", sourceRecordId };
  }

  if (endsAt && new Date(endsAt) < new Date(startsAt)) {
    return { ok: false, reason: "endTime precedes dateTime", sourceRecordId };
  }

  const feeAmount =
    record.fee && isFiniteNumber(record.fee.amount) ? record.fee.amount : null;
  const structuredFee =
    feeAmount != null && feeAmount > 0 ? Math.round(feeAmount * 100) : null;
  const costCents = resolveCostCents({
    structuredCents: structuredFee,
    // Explicit Meetup fee.amount === 0 means free unless description contradicts.
    isFree: feeAmount === 0 ? true : null,
    description: record.description,
  });

  const imageUrl =
    (typeof record.imageUrl === "string" && record.imageUrl.startsWith("http")
      ? record.imageUrl
      : null) ??
    (typeof record.displayImageUrl === "string" &&
    record.displayImageUrl.startsWith("http")
      ? record.displayImageUrl
      : null);

  const locationLabel = formatVenueLabel(record.venue);
  const hostLabel =
    typeof record.group?.name === "string" && record.group.name.trim()
      ? record.group.name.trim()
      : null;

  const draft: NormalizedImportDraft = {
    title,
    description:
      typeof record.description === "string" ? record.description.trim() : "",
    category: mapCategory(record),
    startsAt,
    endsAt,
    latitude: lat,
    longitude: lng,
    imageUrl,
    sourceUrl,
    sourceRecordId,
    sourceProvider: "meetup",
    sourceType: "apify",
    difficultyLabel: null,
    costCents,
    locationLabel,
    hostLabel,
  };

  return { ok: true, draft };
}

/** Build a display venue string from Meetup fields that are actually present. */
export function formatVenueLabel(
  venue: ApifyMeetupEventRecord["venue"],
): string | null {
  if (!venue || typeof venue !== "object") return null;

  const name = typeof venue.name === "string" ? venue.name.trim() : "";
  const address = typeof venue.address === "string" ? venue.address.trim() : "";
  const city = typeof venue.city === "string" ? venue.city.trim() : "";
  const state = typeof venue.state === "string" ? venue.state.trim() : "";
  const cityState = [city, state].filter(Boolean).join(", ");

  if (name && cityState) return `${name} · ${cityState}`;
  if (name && address) return `${name} · ${address}`;
  if (address) return address;
  if (name) return name;
  if (cityState) return cityState;
  return null;
}
