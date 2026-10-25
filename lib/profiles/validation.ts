/**
 * Server-side profile validation. Rejects private identifiers and invalid ranges.
 */

import type { DayOfWeek, SkillPreference } from "@/types/preferences";
import type {
  DmPolicy,
  LocationShareLevel,
  ProfileUpdateInput,
} from "@/types/profile";

const DAYS: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const SKILLS: SkillPreference[] = [
  "beginner",
  "intermediate",
  "advanced",
  "any",
];
const DM_POLICIES: DmPolicy[] = ["everyone", "discoverable_only", "nobody"];
const SHARE_LEVELS: LocationShareLevel[] = [
  "hidden",
  "city_only",
  "approximate",
];

const MAX_NAME = 80;
const MAX_BIO = 500;
const MAX_CITY = 80;
const MAX_INTERESTS = 24;
const MAX_INTEREST_LEN = 40;

export type ProfileValidationResult =
  | { ok: true; value: ProfileUpdateInput }
  | { ok: false; error: string };

function trimOrNull(value: unknown, max: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const t = value.trim();
  if (!t) return null;
  if (t.length > max) return undefined;
  return t;
}

function isDay(value: unknown): value is DayOfWeek {
  return typeof value === "string" && (DAYS as string[]).includes(value);
}

function isSkill(value: unknown): value is SkillPreference {
  return typeof value === "string" && (SKILLS as string[]).includes(value);
}

function isDmPolicy(value: unknown): value is DmPolicy {
  return typeof value === "string" && (DM_POLICIES as string[]).includes(value);
}

function isShareLevel(value: unknown): value is LocationShareLevel {
  return (
    typeof value === "string" && (SHARE_LEVELS as string[]).includes(value)
  );
}

function isHour(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 23
  );
}

/** Round discovery pins to ~1km so we never store street-level precision. */
export function fuzzDiscoveryCoordinate(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Parse and validate a profile PATCH body.
 * Ignores unknown keys (including forged `id` / `userId`).
 */
export function parseProfileUpdate(body: unknown): ProfileValidationResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid profile payload" };
  }
  const raw = body as Record<string, unknown>;
  const out: ProfileUpdateInput = {};

  if ("displayName" in raw) {
    const name = trimOrNull(raw.displayName, MAX_NAME);
    if (name === undefined || name === null) {
      return { ok: false, error: "Display name is required (1–80 characters)" };
    }
    out.displayName = name;
  }

  if ("avatarUrl" in raw) {
    if (raw.avatarUrl === null || raw.avatarUrl === "") {
      out.avatarUrl = null;
    } else if (typeof raw.avatarUrl === "string") {
      const url = raw.avatarUrl.trim();
      if (!/^https:\/\//i.test(url) || url.length > 500) {
        return {
          ok: false,
          error: "Avatar must be an https URL (or empty)",
        };
      }
      out.avatarUrl = url;
    } else {
      return { ok: false, error: "Invalid avatar URL" };
    }
  }

  if ("bio" in raw) {
    if (raw.bio === null || raw.bio === "") {
      out.bio = null;
    } else if (typeof raw.bio === "string") {
      const bio = raw.bio.trim();
      if (bio.length > MAX_BIO) {
        return { ok: false, error: `Bio must be ≤ ${MAX_BIO} characters` };
      }
      out.bio = bio || null;
    } else {
      return { ok: false, error: "Invalid bio" };
    }
  }

  if ("city" in raw) {
    const city = trimOrNull(raw.city, MAX_CITY);
    if (city === undefined) {
      return { ok: false, error: "City must be ≤ 80 characters" };
    }
    out.city = city;
  }

  if ("neighborhood" in raw) {
    const neighborhood = trimOrNull(raw.neighborhood, MAX_CITY);
    if (neighborhood === undefined) {
      return { ok: false, error: "Neighborhood must be ≤ 80 characters" };
    }
    out.neighborhood = neighborhood;
  }

  if ("interests" in raw) {
    if (!Array.isArray(raw.interests)) {
      return { ok: false, error: "Interests must be an array of strings" };
    }
    const interests: string[] = [];
    for (const item of raw.interests) {
      if (typeof item !== "string") {
        return { ok: false, error: "Each interest must be a string" };
      }
      const t = item.trim().toLowerCase();
      if (!t) continue;
      if (t.length > MAX_INTEREST_LEN) {
        return {
          ok: false,
          error: `Interest labels must be ≤ ${MAX_INTEREST_LEN} characters`,
        };
      }
      if (!interests.includes(t)) interests.push(t);
      if (interests.length > MAX_INTERESTS) {
        return {
          ok: false,
          error: `At most ${MAX_INTERESTS} interests`,
        };
      }
    }
    out.interests = interests;
  }

  if ("skillLevel" in raw) {
    if (raw.skillLevel === null || raw.skillLevel === "") {
      out.skillLevel = null;
    } else if (isSkill(raw.skillLevel)) {
      out.skillLevel = raw.skillLevel;
    } else {
      return { ok: false, error: "Invalid skill level" };
    }
  }

  if ("availabilityDays" in raw) {
    if (!Array.isArray(raw.availabilityDays)) {
      return { ok: false, error: "availabilityDays must be an array" };
    }
    const days: DayOfWeek[] = [];
    for (const d of raw.availabilityDays) {
      if (!isDay(d)) {
        return { ok: false, error: "Invalid weekday in availabilityDays" };
      }
      if (!days.includes(d)) days.push(d);
    }
    out.availabilityDays = days;
  }

  if ("availabilityStartHour" in raw) {
    if (raw.availabilityStartHour === null) {
      out.availabilityStartHour = null;
    } else if (isHour(raw.availabilityStartHour)) {
      out.availabilityStartHour = raw.availabilityStartHour;
    } else {
      return { ok: false, error: "availabilityStartHour must be 0–23" };
    }
  }

  if ("availabilityEndHour" in raw) {
    if (raw.availabilityEndHour === null) {
      out.availabilityEndHour = null;
    } else if (isHour(raw.availabilityEndHour)) {
      out.availabilityEndHour = raw.availabilityEndHour;
    } else {
      return { ok: false, error: "availabilityEndHour must be 0–23" };
    }
  }

  if ("preferredRadiusKm" in raw) {
    if (raw.preferredRadiusKm === null) {
      out.preferredRadiusKm = null;
    } else if (
      typeof raw.preferredRadiusKm === "number" &&
      Number.isFinite(raw.preferredRadiusKm) &&
      Number.isInteger(raw.preferredRadiusKm) &&
      raw.preferredRadiusKm >= 1 &&
      raw.preferredRadiusKm <= 200
    ) {
      out.preferredRadiusKm = raw.preferredRadiusKm;
    } else {
      return {
        ok: false,
        error: "preferredRadiusKm must be an integer 1–200 (or null)",
      };
    }
  }

  if ("discoverable" in raw) {
    if (typeof raw.discoverable !== "boolean") {
      return { ok: false, error: "discoverable must be a boolean" };
    }
    out.discoverable = raw.discoverable;
  }

  if ("discoveryLat" in raw || "discoveryLng" in raw) {
    const lat = raw.discoveryLat;
    const lng = raw.discoveryLng;
    if (lat === null && lng === null) {
      out.discoveryLat = null;
      out.discoveryLng = null;
    } else if (
      typeof lat === "number" &&
      typeof lng === "number" &&
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180
    ) {
      out.discoveryLat = fuzzDiscoveryCoordinate(lat);
      out.discoveryLng = fuzzDiscoveryCoordinate(lng);
    } else {
      return {
        ok: false,
        error: "Discovery pin requires a valid lat/lng pair (or both null)",
      };
    }
  }

  if ("dmPolicy" in raw) {
    if (!isDmPolicy(raw.dmPolicy)) {
      return { ok: false, error: "Invalid messaging preference" };
    }
    out.dmPolicy = raw.dmPolicy;
  }

  if ("locationShareLevel" in raw) {
    if (!isShareLevel(raw.locationShareLevel)) {
      return { ok: false, error: "Invalid location share level" };
    }
    out.locationShareLevel = raw.locationShareLevel;
  }

  // Ownership: ignore forged identity fields if a client sends them.
  // (id / userId are never copied into `out`.)

  return { ok: true, value: out };
}

/** Enforce discoverable rules for the chosen location share level. */
export function assertDiscoverableCoords(merged: {
  discoverable: boolean;
  discoveryLat: number | null;
  discoveryLng: number | null;
  locationShareLevel?: LocationShareLevel;
}): string | null {
  if (!merged.discoverable) return null;
  const share = merged.locationShareLevel ?? "approximate";
  if (share === "hidden") {
    return "Turn off discovery when location share is hidden";
  }
  if (share === "city_only") {
    return null;
  }
  if (
    merged.discoveryLat == null ||
    merged.discoveryLng == null ||
    !Number.isFinite(merged.discoveryLat) ||
    !Number.isFinite(merged.discoveryLng)
  ) {
    return "Approximate discovery needs a city pin (not live GPS)";
  }
  return null;
}
