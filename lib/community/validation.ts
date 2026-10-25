/**
 * Server-side community post validation.
 * Ignores forged owner/id fields — ownership always comes from auth.uid().
 */

import type { ActivityCategory } from "@/types/map-entities";
import type { DayOfWeek, SkillPreference } from "@/types/preferences";
import type {
  CommunityPostCreateInput,
  CommunityPostUpdateInput,
  PostIntent,
  PostStatus,
  PostVisibility,
} from "@/types/community-post";

const DAYS: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const SKILLS: SkillPreference[] = [
  "beginner",
  "intermediate",
  "advanced",
  "any",
];
const INTENTS: PostIntent[] = [
  "find_teammates",
  "find_venue",
  "join_activity",
  "organize_meetup",
];
const VISIBILITIES: PostVisibility[] = [
  "public",
  "author_discoverable",
  "private",
];
const STATUSES: PostStatus[] = ["open", "closed", "archived"];
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

export const POST_MESSAGE_MAX = 2000;
export const POST_ACTIVITY_MAX = 80;
export const POST_CITY_MAX = 80;
export const POST_LIST_DEFAULT_LIMIT = 20;
export const POST_LIST_MAX_LIMIT = 50;

export type PostValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function trimOrNull(value: unknown, max: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
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

function isIntent(value: unknown): value is PostIntent {
  return typeof value === "string" && (INTENTS as string[]).includes(value);
}

function isVisibility(value: unknown): value is PostVisibility {
  return (
    typeof value === "string" && (VISIBILITIES as string[]).includes(value)
  );
}

function isStatus(value: unknown): value is PostStatus {
  return typeof value === "string" && (STATUSES as string[]).includes(value);
}

function isCategory(value: unknown): value is ActivityCategory {
  return (
    typeof value === "string" && (CATEGORIES as string[]).includes(value)
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

function parseDays(raw: unknown): DayOfWeek[] | undefined | null {
  if (raw === undefined) return undefined;
  if (raw === null) return [];
  if (!Array.isArray(raw)) return null;
  const days: DayOfWeek[] = [];
  for (const d of raw) {
    if (!isDay(d)) return null;
    if (!days.includes(d)) days.push(d);
  }
  return days;
}

function parseOptionalStructured(
  raw: Record<string, unknown>,
  out: CommunityPostUpdateInput,
): string | null {
  if ("activity" in raw) {
    const activity = trimOrNull(raw.activity, POST_ACTIVITY_MAX);
    if (activity === undefined) {
      return `Activity must be ≤ ${POST_ACTIVITY_MAX} characters`;
    }
    out.activity = activity;
  }

  if ("category" in raw) {
    if (raw.category === null || raw.category === "") {
      out.category = null;
    } else if (isCategory(raw.category)) {
      out.category = raw.category;
    } else {
      return "Invalid category";
    }
  }

  if ("city" in raw) {
    const city = trimOrNull(raw.city, POST_CITY_MAX);
    if (city === undefined) {
      return `City must be ≤ ${POST_CITY_MAX} characters`;
    }
    out.city = city;
  }

  if ("neighborhood" in raw) {
    const neighborhood = trimOrNull(raw.neighborhood, POST_CITY_MAX);
    if (neighborhood === undefined) {
      return `Neighborhood must be ≤ ${POST_CITY_MAX} characters`;
    }
    out.neighborhood = neighborhood;
  }

  if ("preferredDays" in raw) {
    const days = parseDays(raw.preferredDays);
    if (days === null) return "preferredDays must be an array of weekdays";
    if (days !== undefined) out.preferredDays = days;
  }

  if ("timeStartHour" in raw) {
    if (raw.timeStartHour === null) {
      out.timeStartHour = null;
    } else if (isHour(raw.timeStartHour)) {
      out.timeStartHour = raw.timeStartHour;
    } else {
      return "timeStartHour must be 0–23";
    }
  }

  if ("timeEndHour" in raw) {
    if (raw.timeEndHour === null) {
      out.timeEndHour = null;
    } else if (isHour(raw.timeEndHour)) {
      out.timeEndHour = raw.timeEndHour;
    } else {
      return "timeEndHour must be 0–23";
    }
  }

  if ("intent" in raw) {
    if (!isIntent(raw.intent)) return "Invalid intent";
    out.intent = raw.intent;
  }

  if ("skillLevel" in raw) {
    if (raw.skillLevel === null || raw.skillLevel === "") {
      out.skillLevel = null;
    } else if (isSkill(raw.skillLevel)) {
      out.skillLevel = raw.skillLevel;
    } else {
      return "Invalid skill level";
    }
  }

  if ("budgetCents" in raw) {
    if (raw.budgetCents === null) {
      out.budgetCents = null;
    } else if (
      typeof raw.budgetCents === "number" &&
      Number.isInteger(raw.budgetCents) &&
      raw.budgetCents >= 0 &&
      raw.budgetCents <= 1_000_000
    ) {
      out.budgetCents = raw.budgetCents;
    } else {
      return "budgetCents must be an integer 0–1000000 (or null)";
    }
  }

  if ("radiusKm" in raw) {
    if (raw.radiusKm === null) {
      out.radiusKm = null;
    } else if (
      typeof raw.radiusKm === "number" &&
      Number.isInteger(raw.radiusKm) &&
      raw.radiusKm >= 1 &&
      raw.radiusKm <= 200
    ) {
      out.radiusKm = raw.radiusKm;
    } else {
      return "radiusKm must be an integer 1–200 (or null)";
    }
  }

  if ("visibility" in raw) {
    if (!isVisibility(raw.visibility)) return "Invalid visibility";
    out.visibility = raw.visibility;
  }

  if ("status" in raw) {
    if (!isStatus(raw.status)) return "Invalid status";
    out.status = raw.status;
  }

  return null;
}

/**
 * Parse create body. Message is required; structured fields optional.
 * Forged ownerId / id are ignored.
 */
export function parsePostCreate(
  body: unknown,
): PostValidationResult<CommunityPostCreateInput> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid post payload" };
  }
  const raw = body as Record<string, unknown>;

  if (typeof raw.message !== "string") {
    return { ok: false, error: "Message is required" };
  }
  const message = raw.message.trim();
  if (!message || message.length > POST_MESSAGE_MAX) {
    return {
      ok: false,
      error: `Message must be 1–${POST_MESSAGE_MAX} characters`,
    };
  }

  const out: CommunityPostCreateInput = { message };
  const err = parseOptionalStructured(raw, out);
  if (err) return { ok: false, error: err };

  if (!out.intent) out.intent = "find_teammates";
  if (!out.visibility) out.visibility = "public";
  if (!out.status) out.status = "open";
  if (!out.preferredDays) out.preferredDays = [];

  return { ok: true, value: out };
}

/**
 * Parse PATCH body. Partial fields only; forged ownerId / id ignored.
 */
export function parsePostUpdate(
  body: unknown,
): PostValidationResult<CommunityPostUpdateInput> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid post payload" };
  }
  const raw = body as Record<string, unknown>;
  const out: CommunityPostUpdateInput = {};

  if ("message" in raw) {
    if (typeof raw.message !== "string") {
      return { ok: false, error: "Message must be a string" };
    }
    const message = raw.message.trim();
    if (!message || message.length > POST_MESSAGE_MAX) {
      return {
        ok: false,
        error: `Message must be 1–${POST_MESSAGE_MAX} characters`,
      };
    }
    out.message = message;
  }

  const err = parseOptionalStructured(raw, out);
  if (err) return { ok: false, error: err };

  if (Object.keys(out).length === 0) {
    return { ok: false, error: "No updatable fields provided" };
  }

  return { ok: true, value: out };
}

/** Clamp list limit to a bounded range. */
export function clampPostListLimit(raw: unknown): number {
  if (
    typeof raw === "number" &&
    Number.isFinite(raw) &&
    Number.isInteger(raw)
  ) {
    return Math.min(POST_LIST_MAX_LIMIT, Math.max(1, raw));
  }
  if (typeof raw === "string" && /^\d+$/.test(raw)) {
    return clampPostListLimit(Number(raw));
  }
  return POST_LIST_DEFAULT_LIMIT;
}
