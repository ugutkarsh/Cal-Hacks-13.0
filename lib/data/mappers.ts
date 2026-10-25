/**
 * Map validated DB rows → application MapEntity shapes used by the UI.
 */

import { resolveCostCents } from "@/lib/apify/import-draft";
import type {
  DbActivityWithRelations,
  DbPlace,
  DbProfile,
} from "@/types/database";
import type {
  ActivityCategory,
  EventEntity,
  PersonEntity,
  PlaceEntity,
} from "@/types/map-entities";

const CATEGORIES: ActivityCategory[] = [
  "hiking",
  "cycling",
  "running",
  "outdoor",
  "meetup",
  "climbing",
  "sports",
  "other",
];

export function toActivityCategory(value: unknown): ActivityCategory {
  if (
    typeof value === "string" &&
    CATEGORIES.includes(value as ActivityCategory)
  ) {
    return value as ActivityCategory;
  }
  return "other";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function mapPlaceRow(row: DbPlace): PlaceEntity | null {
  if (
    !row?.id ||
    typeof row.name !== "string" ||
    !row.name.trim() ||
    !isFiniteNumber(row.latitude) ||
    !isFiniteNumber(row.longitude)
  ) {
    return null;
  }

  return {
    id: row.id,
    kind: "place",
    name: row.name,
    category: toActivityCategory(row.category),
    summary: typeof row.description === "string" ? row.description : "",
    locationLabel: row.name,
    coordinates: { lat: row.latitude, lng: row.longitude },
    imageUrl: row.image_url ?? null,
    imageCredit: null,
    provenance: "supabase",
    createdAt:
      typeof row.created_at === "string"
        ? row.created_at
        : new Date().toISOString(),
    amenities: [],
    rating: null,
    reviewCount: 0,
  };
}

export function mapActivityRow(
  row: DbActivityWithRelations,
  registrationCount = 0,
): EventEntity | null {
  if (!row?.id || typeof row.title !== "string" || !row.title.trim()) {
    return null;
  }
  if (typeof row.starts_at !== "string") {
    return null;
  }

  const lat =
    row.places && isFiniteNumber(row.places.latitude)
      ? row.places.latitude
      : row.latitude;
  const lng =
    row.places && isFiniteNumber(row.places.longitude)
      ? row.places.longitude
      : row.longitude;

  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) {
    return null;
  }

  const locationLabel =
    (typeof row.location_label === "string" && row.location_label.trim()) ||
    row.places?.name?.trim() ||
    `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

  const endsAt = row.ends_at ?? row.starts_at;
  const capacity = isFiniteNumber(row.capacity) ? row.capacity : 0;
  const safeCount = Math.max(0, Math.floor(registrationCount));
  const isApify = row.source_type === "apify";
  const freshness =
    typeof row.last_verified_at === "string"
      ? row.last_verified_at
      : typeof row.imported_at === "string"
        ? row.imported_at
        : null;

  const profileName = row.profiles?.display_name?.trim();
  const hostLabel =
    typeof row.host_label === "string" ? row.host_label.trim() : "";
  const organizerName =
    profileName ||
    hostLabel ||
    (isApify ? "Host not listed" : "Organizer");

  const provider =
    typeof row.source_provider === "string"
      ? row.source_provider.trim().toLowerCase()
      : "";
  const providerLabel =
    provider === "eventbrite"
      ? "Eventbrite via Apify"
      : provider === "meetup"
        ? "Meetup via Apify"
        : provider
          ? `${provider.charAt(0).toUpperCase()}${provider.slice(1)} via Apify`
          : "Imported via Apify";

  // Reconcile false Free (0) when the public description states a fee.
  const storedCost =
    typeof row.cost_cents === "number" && Number.isFinite(row.cost_cents)
      ? Math.max(0, Math.round(row.cost_cents))
      : null;
  const description =
    typeof row.description === "string" ? row.description : "";
  const costCents = resolveCostCents({
    structuredCents: storedCost != null && storedCost > 0 ? storedCost : null,
    isFree: storedCost === 0 ? true : null,
    description,
  });

  return {
    id: row.id,
    kind: "event",
    name: row.title,
    category: toActivityCategory(row.category),
    summary: typeof row.description === "string" ? row.description : "",
    locationLabel,
    coordinates: { lat, lng },
    imageUrl: row.image_url ?? row.places?.image_url ?? null,
    imageCredit: isApify
      ? freshness
        ? `${providerLabel} · verified ${freshness.slice(0, 10)}`
        : providerLabel
      : row.source_url
        ? "imported"
        : null,
    provenance: isApify ? "apify" : "supabase",
    createdAt:
      typeof row.created_at === "string"
        ? row.created_at
        : new Date().toISOString(),
    startsAt: row.starts_at,
    endsAt,
    organizerName,
    organizerId: row.organizer_id ?? "unknown",
    sourceUrl:
      typeof row.source_url === "string" && row.source_url.startsWith("http")
        ? row.source_url
        : null,
    capacity,
    attendeeCount: safeCount,
    attendeesPreview: [],
    reviews: [],
    isRegistrationOpen: capacity === 0 || safeCount < capacity,
    difficultyLabel: row.difficulty_label?.trim() || "Open to all",
    costCents,
  };
}

/**
 * Only map profiles that opted into discovery with approximate coordinates.
 * Never treat these as live location pings.
 */
export function mapDiscoverableProfile(row: DbProfile): PersonEntity | null {
  if (!row?.id || !row.discoverable) {
    return null;
  }
  // Map pins only when the user chose approximate sharing.
  const share = row.location_share_level ?? "approximate";
  if (share !== "approximate") {
    return null;
  }
  if (!isFiniteNumber(row.discovery_lat) || !isFiniteNumber(row.discovery_lng)) {
    return null;
  }
  if (typeof row.display_name !== "string" || !row.display_name.trim()) {
    return null;
  }

  const interests = Array.isArray(row.interests)
    ? row.interests.map(toActivityCategory)
    : [];

  // Fuzz ~1km so map pins never imply exact home / live presence.
  const lat = Math.round(row.discovery_lat * 100) / 100;
  const lng = Math.round(row.discovery_lng * 100) / 100;

  const city =
    typeof row.city === "string" && row.city.trim() ? row.city.trim() : null;
  const neighborhood =
    typeof row.neighborhood === "string" && row.neighborhood.trim()
      ? row.neighborhood.trim()
      : null;
  const locationLabel = neighborhood && city
    ? `${neighborhood}, ${city} · approximate`
    : city
      ? `${city} · approximate`
      : "Approximate discovery pin (not live location)";

  return {
    id: row.id,
    kind: "person",
    name: row.display_name,
    category: interests[0] ?? "meetup",
    summary:
      (typeof row.bio === "string" && row.bio.trim()) ||
      "Opted into discovery on Trailmap.",
    locationLabel,
    coordinates: { lat, lng },
    imageUrl: row.avatar_url ?? null,
    imageCredit: null,
    provenance: "supabase",
    createdAt:
      typeof row.created_at === "string"
        ? row.created_at
        : new Date().toISOString(),
    discoveryOptIn: true,
    interests: interests.length > 0 ? interests : ["meetup"],
    bio: typeof row.bio === "string" ? row.bio : "",
    presenceNote:
      "Opt-in discovery pin — approximate location only. Not a live GPS position.",
  };
}
