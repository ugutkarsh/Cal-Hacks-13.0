/**
 * Normalize scrapersdelight/classpass-studios-scraper → place drafts.
 * Studios map to places (venues), not timed activities.
 */

import {
  isFiniteNumber,
  mapRecreationCategory,
} from "@/lib/apify/import-draft";
import type {
  NormalizePlaceResult,
  NormalizedPlaceImportDraft,
} from "@/lib/apify/place-draft";
import type { ApifyClasspassRecord } from "@/types/apify-classpass";

const SOURCE_PROVIDER = "classpass";

export function normalizeClasspassRecord(
  record: ApifyClasspassRecord,
): NormalizePlaceResult {
  const sourceRecordId =
    record.venueId != null && String(record.venueId).trim()
      ? String(record.venueId).trim()
      : typeof record.alias === "string" && record.alias.trim()
        ? record.alias.trim()
        : null;

  if (!sourceRecordId) {
    return {
      ok: false,
      reason: "Missing venueId and alias",
      sourceRecordId: null,
    };
  }

  const name =
    typeof record.studioName === "string" ? record.studioName.trim() : "";
  if (!name) {
    return { ok: false, reason: "Missing studioName", sourceRecordId };
  }

  const subtitle =
    typeof record.subtitle === "string" ? record.subtitle.trim() : "";
  const displayName = subtitle ? `${name} — ${subtitle}` : name;

  if (
    !isFiniteNumber(record.latitude) ||
    !isFiniteNumber(record.longitude)
  ) {
    return {
      ok: false,
      reason: "Missing venue coordinates",
      sourceRecordId,
    };
  }
  if (
    record.latitude < -90 ||
    record.latitude > 90 ||
    record.longitude < -180 ||
    record.longitude > 180
  ) {
    return {
      ok: false,
      reason: "Coordinates out of range",
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
      reason: "Missing or invalid ClassPass url",
      sourceRecordId,
    };
  }

  const activities = Array.isArray(record.activities)
    ? record.activities.filter((a): a is string => typeof a === "string")
    : [];
  const categories = Array.isArray(record.categories)
    ? record.categories.filter((c): c is string => typeof c === "string")
    : [];

  const descriptionParts = [
    typeof record.description === "string" ? record.description.trim() : "",
    activities.length ? `Activities: ${activities.join(", ")}` : "",
    typeof record.address === "string" ? record.address.trim() : "",
  ].filter(Boolean);

  const imageCandidate =
    (typeof record.imageUrl === "string" && record.imageUrl.trim()) ||
    (typeof record.mainImage === "string" && record.mainImage.trim()) ||
    "";

  const draft: NormalizedPlaceImportDraft = {
    name: displayName,
    description: descriptionParts.join("\n\n").slice(0, 4000),
    category: mapRecreationCategory(
      [name, ...activities, ...categories, "fitness gym studio"].join(" "),
    ),
    latitude: record.latitude,
    longitude: record.longitude,
    imageUrl: imageCandidate.startsWith("http") ? imageCandidate : null,
    sourceUrl,
    sourceRecordId,
    sourceProvider: SOURCE_PROVIDER,
    sourceType: "apify",
  };

  return { ok: true, draft };
}
