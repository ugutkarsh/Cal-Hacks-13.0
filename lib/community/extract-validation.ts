/**
 * Validate / sanitize extraction payloads (including malformed “model” JSON).
 * Never invent skill, budget, or precise addresses.
 */

import type {
  ExtractedPostPreferences,
  ExtractionField,
  ExtractionFieldSource,
  PostExtractionConfirmation,
  PostExtractionResult,
} from "@/types/community-extract";
import type { PostIntent } from "@/types/community-post";
import type { ActivityCategory } from "@/types/map-entities";
import type { DayOfWeek, SkillPreference } from "@/types/preferences";
import {
  extractPostPreferences,
  unavailablePostExtraction,
} from "@/lib/community/extract-preferences";
import { parsePostCreate } from "@/lib/community/validation";

const SOURCES: ExtractionFieldSource[] = [
  "stated",
  "inferred",
  "unknown",
  "ambiguous",
];
const DAYS: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const INTENTS: PostIntent[] = [
  "find_teammates",
  "find_venue",
  "join_activity",
  "organize_meetup",
];
const SKILLS: SkillPreference[] = [
  "beginner",
  "intermediate",
  "advanced",
  "any",
];
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

function isSource(v: unknown): v is ExtractionFieldSource {
  return typeof v === "string" && (SOURCES as string[]).includes(v);
}

function unknownField<T>(): ExtractionField<T> {
  return { value: null, source: "unknown", note: null };
}

function sanitizeStringField(
  raw: unknown,
  max: number,
): ExtractionField<string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return unknownField();
  }
  const obj = raw as Record<string, unknown>;
  const source = isSource(obj.source) ? obj.source : "unknown";
  if (source === "unknown" || obj.value == null || obj.value === "") {
    return unknownField();
  }
  if (typeof obj.value !== "string") return unknownField();
  const t = obj.value.trim();
  if (!t || t.length > max) return unknownField();
  // Reject street-like values even if a model invented them.
  if (
    /\b\d{1,5}\s+[A-Za-z].*\b(?:st|street|ave|avenue|blvd|road|rd)\b/i.test(t)
  ) {
    return {
      value: null,
      source: "ambiguous",
      note: "Rejected precise address-like value",
    };
  }
  return {
    value: t,
    source,
    note: typeof obj.note === "string" ? obj.note : null,
  };
}

function sanitizeHourField(raw: unknown): ExtractionField<number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return unknownField();
  }
  const obj = raw as Record<string, unknown>;
  const source = isSource(obj.source) ? obj.source : "unknown";
  if (
    typeof obj.value !== "number" ||
    !Number.isInteger(obj.value) ||
    obj.value < 0 ||
    obj.value > 23
  ) {
    return unknownField();
  }
  return {
    value: obj.value,
    source: source === "unknown" ? "stated" : source,
    note: typeof obj.note === "string" ? obj.note : null,
  };
}

function sanitizeDaysField(raw: unknown): ExtractionField<DayOfWeek[]> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return unknownField();
  }
  const obj = raw as Record<string, unknown>;
  const source = isSource(obj.source) ? obj.source : "unknown";
  if (!Array.isArray(obj.value)) return unknownField();
  const days: DayOfWeek[] = [];
  for (const d of obj.value) {
    if (typeof d === "string" && (DAYS as string[]).includes(d) && !days.includes(d as DayOfWeek)) {
      days.push(d as DayOfWeek);
    }
  }
  if (days.length === 0) return unknownField();
  return {
    value: days,
    source,
    note: typeof obj.note === "string" ? obj.note : null,
  };
}

function sanitizeIntentsField(raw: unknown): ExtractionField<PostIntent[]> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return unknownField();
  }
  const obj = raw as Record<string, unknown>;
  const source = isSource(obj.source) ? obj.source : "unknown";
  if (!Array.isArray(obj.value)) return unknownField();
  const intents: PostIntent[] = [];
  for (const i of obj.value) {
    if (
      typeof i === "string" &&
      (INTENTS as string[]).includes(i) &&
      !intents.includes(i as PostIntent)
    ) {
      intents.push(i as PostIntent);
    }
  }
  if (intents.length === 0) return unknownField();
  return {
    value: intents,
    source,
    note: typeof obj.note === "string" ? obj.note : null,
  };
}

function sanitizeSkillField(raw: unknown): ExtractionField<SkillPreference> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return unknownField();
  }
  const obj = raw as Record<string, unknown>;
  const source = isSource(obj.source) ? obj.source : "unknown";
  // Never accept inferred skill — only stated.
  if (source !== "stated") return unknownField();
  if (
    typeof obj.value === "string" &&
    (SKILLS as string[]).includes(obj.value)
  ) {
    return {
      value: obj.value as SkillPreference,
      source: "stated",
      note: typeof obj.note === "string" ? obj.note : null,
    };
  }
  return unknownField();
}

function sanitizeBudgetField(raw: unknown): ExtractionField<number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return unknownField();
  }
  const obj = raw as Record<string, unknown>;
  const source = isSource(obj.source) ? obj.source : "unknown";
  if (source !== "stated") return unknownField();
  if (
    typeof obj.value === "number" &&
    Number.isInteger(obj.value) &&
    obj.value >= 0 &&
    obj.value <= 1_000_000
  ) {
    return {
      value: obj.value,
      source: "stated",
      note: typeof obj.note === "string" ? obj.note : null,
    };
  }
  return unknownField();
}

function sanitizeCategoryField(
  raw: unknown,
): ExtractionField<ActivityCategory> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return unknownField();
  }
  const obj = raw as Record<string, unknown>;
  const source = isSource(obj.source) ? obj.source : "unknown";
  if (
    typeof obj.value === "string" &&
    (CATEGORIES as string[]).includes(obj.value)
  ) {
    return {
      value: obj.value as ActivityCategory,
      source,
      note: typeof obj.note === "string" ? obj.note : null,
    };
  }
  return unknownField();
}

/**
 * Sanitize a raw extracted object (e.g. malformed LLM JSON).
 * Drops invented skill/budget; rejects street addresses.
 */
export function sanitizeExtractedPreferences(
  raw: unknown,
): ExtractedPostPreferences {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      activity: unknownField(),
      category: unknownField(),
      city: unknownField(),
      neighborhood: unknownField(),
      preferredDays: unknownField(),
      timeStartHour: unknownField(),
      timeEndHour: unknownField(),
      timeZoneHint: unknownField(),
      intents: unknownField(),
      skillLevel: unknownField(),
      budgetCents: unknownField(),
      radiusKm: unknownField(),
    };
  }
  const obj = raw as Record<string, unknown>;
  return {
    activity: sanitizeStringField(obj.activity, 80),
    category: sanitizeCategoryField(obj.category),
    city: sanitizeStringField(obj.city, 80),
    neighborhood: sanitizeStringField(obj.neighborhood, 80),
    preferredDays: sanitizeDaysField(obj.preferredDays),
    timeStartHour: sanitizeHourField(obj.timeStartHour),
    timeEndHour: sanitizeHourField(obj.timeEndHour),
    timeZoneHint: sanitizeStringField(obj.timeZoneHint, 64),
    intents: sanitizeIntentsField(obj.intents),
    skillLevel: sanitizeSkillField(obj.skillLevel),
    budgetCents: sanitizeBudgetField(obj.budgetCents),
    radiusKm: unknownField(), // never accept invented radius from untrusted output
  };
}

export type ExtractRequestResult =
  | { ok: true; value: { message: string; timeZone: string | null } }
  | { ok: false; error: string };

export function parseExtractRequest(body: unknown): ExtractRequestResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid extract payload" };
  }
  const raw = body as Record<string, unknown>;
  if (typeof raw.message !== "string") {
    return { ok: false, error: "Message is required" };
  }
  const message = raw.message.trim();
  if (!message) return { ok: false, error: "Message is required" };
  if (message.length > 2000) {
    return { ok: false, error: "Message must be ≤ 2000 characters" };
  }
  let timeZone: string | null = null;
  if (raw.timeZone != null && raw.timeZone !== "") {
    if (
      typeof raw.timeZone === "string" &&
      /^[A-Za-z_]+\/[A-Za-z_/+]+$/.test(raw.timeZone)
    ) {
      timeZone = raw.timeZone;
    } else {
      return { ok: false, error: "timeZone must be an IANA name when provided" };
    }
  }
  return { ok: true, value: { message, timeZone } };
}

/**
 * Merge author confirmation onto the original message.
 * Original text is preserved; structured fields come from confirmation.
 */
export function applyExtractionConfirmation(
  confirmation: PostExtractionConfirmation,
): { ok: true; createBody: Record<string, unknown> } | { ok: false; error: string } {
  if (
    !confirmation ||
    typeof confirmation.originalMessage !== "string" ||
    !confirmation.originalMessage.trim()
  ) {
    return { ok: false, error: "originalMessage is required" };
  }

  const createBody: Record<string, unknown> = {
    message: confirmation.originalMessage.trim(),
  };
  if ("activity" in confirmation) createBody.activity = confirmation.activity;
  if ("category" in confirmation) createBody.category = confirmation.category;
  if ("city" in confirmation) createBody.city = confirmation.city;
  if ("neighborhood" in confirmation) {
    createBody.neighborhood = confirmation.neighborhood;
  }
  if ("preferredDays" in confirmation) {
    createBody.preferredDays = confirmation.preferredDays;
  }
  if ("timeStartHour" in confirmation) {
    createBody.timeStartHour = confirmation.timeStartHour;
  }
  if ("timeEndHour" in confirmation) {
    createBody.timeEndHour = confirmation.timeEndHour;
  }
  if ("intent" in confirmation && confirmation.intent) {
    createBody.intent = confirmation.intent;
  }
  if ("skillLevel" in confirmation) {
    createBody.skillLevel = confirmation.skillLevel;
  }
  if ("budgetCents" in confirmation) {
    createBody.budgetCents = confirmation.budgetCents;
  }
  if ("radiusKm" in confirmation) createBody.radiusKm = confirmation.radiusKm;

  const parsed = parsePostCreate(createBody);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  return { ok: true, createBody };
}

function statedDraftValue<T>(
  source: ExtractionFieldSource,
  value: T | null,
): T | null {
  return source === "stated" && value != null ? value : null;
}

/** Run deterministic extract + ensure suggested draft matches sanitized fields. */
export function runPostExtraction(
  message: string,
  timeZone?: string | null,
): PostExtractionResult {
  try {
    const result = extractPostPreferences(message, { timeZone });
    // Re-sanitize as defense in depth (same path as untrusted model output).
    const extracted = sanitizeExtractedPreferences(result.extracted);
    const primaryIntent =
      extracted.intents.source === "stated" &&
      extracted.intents.value &&
      extracted.intents.value.length > 0
        ? extracted.intents.value[0]
        : null;
    return {
      ...result,
      extracted,
      suggestedDraft: {
        activity: statedDraftValue(
          extracted.activity.source,
          extracted.activity.value,
        ),
        category:
          extracted.activity.source === "stated" &&
          extracted.category.source !== "ambiguous"
            ? extracted.category.value
            : null,
        city: statedDraftValue(extracted.city.source, extracted.city.value),
        neighborhood: statedDraftValue(
          extracted.neighborhood.source,
          extracted.neighborhood.value,
        ),
        preferredDays:
          extracted.preferredDays.source === "stated"
            ? (extracted.preferredDays.value ?? [])
            : [],
        timeStartHour: statedDraftValue(
          extracted.timeStartHour.source,
          extracted.timeStartHour.value,
        ),
        timeEndHour: statedDraftValue(
          extracted.timeEndHour.source,
          extracted.timeEndHour.value,
        ),
        intent: primaryIntent,
        skillLevel: statedDraftValue(
          extracted.skillLevel.source,
          extracted.skillLevel.value,
        ),
        budgetCents: statedDraftValue(
          extracted.budgetCents.source,
          extracted.budgetCents.value,
        ),
        radiusKm: null,
      },
    };
  } catch {
    return unavailablePostExtraction(message);
  }
}
