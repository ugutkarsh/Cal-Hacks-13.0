/**
 * Parse meetup-planner requests → criteria + follow-up questions.
 * Deterministic rules only — not an LLM.
 */

import {
  extractPostPreferences,
  softDaypartHours,
} from "@/lib/community/extract-preferences";
import type {
  MeetupPlanCriteria,
  MeetupPlanFollowUp,
} from "@/types/meetup-plan";

const LIMITATION =
  "No LLM provider is configured. The meetup planner uses a deterministic rules parser (not an LLM) over your real catalog.";

const DISCLAIMER =
  "This is a suggested plan from catalog listings — not a confirmed booking, reservation, or attendee commitment. Venue hours and court availability are not verified.";

export function meetupPlanLimitation(): string {
  return LIMITATION;
}

export function meetupPlanDisclaimer(): string {
  return DISCLAIMER;
}

function emptyCriteria(): MeetupPlanCriteria {
  return {
    activity: null,
    category: null,
    city: null,
    neighborhood: null,
    preferredDays: [],
    timeStartHour: null,
    timeEndHour: null,
    skillLevel: null,
    budgetCents: null,
    groupSize: null,
    vibe: null,
  };
}

/** Extract group size when clearly stated; never invent. */
export function extractGroupSize(text: string): number | null {
  const patterns = [
    /\bfor\s+(\d{1,2})\s+(?:people|players|friends|folks|of\s+us)\b/i,
    /\b(?:group|party)\s+of\s+(\d{1,2})\b/i,
    /\b(\d{1,2})\s+(?:people|players|friends)\b/i,
    /\bfor\s+(one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:people|players|friends)?\b/i,
  ];
  const words: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
  };
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const raw = m[1].toLowerCase();
    const n = words[raw] ?? Number(raw);
    if (Number.isFinite(n) && n >= 1 && n <= 200) return n;
  }
  return null;
}

export function extractVibe(text: string): string | null {
  if (/\bcasual\b/i.test(text)) return "casual";
  if (/\bcompetitive\b/i.test(text)) return "competitive";
  if (/\bsocial\b/i.test(text)) return "social";
  return null;
}

export function parseMeetupPlanRequest(
  message: string,
  options?: { timeZone?: string | null },
): {
  criteria: MeetupPlanCriteria;
  followUps: MeetupPlanFollowUp[];
  originalMessage: string;
  limitation: string;
  disclaimer: string;
} {
  const originalMessage = typeof message === "string" ? message : "";
  const trimmed = originalMessage.trim().slice(0, 2000);
  if (!trimmed) {
    return {
      criteria: emptyCriteria(),
      followUps: [
        {
          field: "activity",
          question: "What activity do you want to plan (e.g. badminton, hike)?",
        },
      ],
      originalMessage,
      limitation: LIMITATION,
      disclaimer: DISCLAIMER,
    };
  }

  const extracted = extractPostPreferences(trimmed, options);
  const draft = extracted.suggestedDraft;
  const ex = extracted.extracted;

  const daypart =
    draft.timeStartHour == null && draft.timeEndHour == null
      ? softDaypartHours(trimmed)
      : null;
  const searchSkill =
    draft.skillLevel ??
    (ex.skillLevel.source === "inferred" ? ex.skillLevel.value : null);

  const criteria: MeetupPlanCriteria = {
    activity: draft.activity,
    category: draft.category,
    city: draft.city,
    neighborhood: draft.neighborhood,
    preferredDays: draft.preferredDays ?? [],
    timeStartHour: draft.timeStartHour ?? daypart?.start ?? null,
    timeEndHour: draft.timeEndHour ?? daypart?.end ?? null,
    skillLevel: searchSkill,
    budgetCents:
      ex.budgetCents.source === "stated" ? ex.budgetCents.value : null,
    groupSize: extractGroupSize(trimmed),
    vibe: extractVibe(trimmed),
  };

  const followUps = buildFollowUps(criteria, ex.activity.source, ex.city.source);
  return {
    criteria,
    followUps,
    originalMessage,
    limitation: LIMITATION,
    disclaimer: DISCLAIMER,
  };
}

export function buildFollowUps(
  criteria: MeetupPlanCriteria,
  activitySource?: string,
  citySource?: string,
): MeetupPlanFollowUp[] {
  const qs: MeetupPlanFollowUp[] = [];
  if (!criteria.activity || activitySource === "ambiguous") {
    qs.push({
      field: "activity",
      question:
        activitySource === "ambiguous"
          ? "Which single activity should we plan for?"
          : "What activity do you want to plan?",
    });
  }
  if (!criteria.city || citySource === "ambiguous") {
    qs.push({
      field: "city",
      question:
        citySource === "ambiguous"
          ? "Which city should we use?"
          : "Which city or area (approximate) should we plan in?",
    });
  }
  if (criteria.preferredDays.length === 0) {
    qs.push({
      field: "preferredDays",
      question: "Which day works (e.g. Saturday), or is any weekend day fine?",
    });
  }
  if (criteria.groupSize == null) {
    qs.push({
      field: "groupSize",
      question: "About how many people (optional — helps filter event capacity)?",
    });
  }
  return qs;
}

/** Essential missing info blocks catalog search until answered. */
export function essentialFollowUps(
  followUps: MeetupPlanFollowUp[],
): MeetupPlanFollowUp[] {
  return followUps.filter(
    (f) => f.field === "activity" || f.field === "city",
  );
}

export function sanitizeMeetupCriteria(raw: unknown): MeetupPlanCriteria | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const days = Array.isArray(o.preferredDays)
    ? o.preferredDays.filter(
        (d): d is MeetupPlanCriteria["preferredDays"][number] =>
          typeof d === "string" &&
          ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].includes(d),
      )
    : [];
  const skill =
    o.skillLevel === "beginner" ||
    o.skillLevel === "intermediate" ||
    o.skillLevel === "advanced" ||
    o.skillLevel === "any"
      ? o.skillLevel
      : null;
  const category =
    typeof o.category === "string" &&
    [
      "hiking",
      "cycling",
      "running",
      "outdoor",
      "sports",
      "meetup",
      "climbing",
      "other",
    ].includes(o.category)
      ? (o.category as MeetupPlanCriteria["category"])
      : null;

  const groupSize =
    typeof o.groupSize === "number" &&
    Number.isFinite(o.groupSize) &&
    o.groupSize >= 1 &&
    o.groupSize <= 200
      ? Math.round(o.groupSize)
      : null;

  return {
    activity:
      typeof o.activity === "string" && o.activity.trim()
        ? o.activity.trim().slice(0, 80)
        : null,
    category,
    city:
      typeof o.city === "string" && o.city.trim()
        ? o.city.trim().slice(0, 80)
        : null,
    neighborhood:
      typeof o.neighborhood === "string" && o.neighborhood.trim()
        ? o.neighborhood.trim().slice(0, 80)
        : null,
    preferredDays: days,
    timeStartHour:
      typeof o.timeStartHour === "number" &&
      o.timeStartHour >= 0 &&
      o.timeStartHour <= 23
        ? o.timeStartHour
        : null,
    timeEndHour:
      typeof o.timeEndHour === "number" &&
      o.timeEndHour >= 0 &&
      o.timeEndHour <= 23
        ? o.timeEndHour
        : null,
    skillLevel: skill,
    budgetCents:
      typeof o.budgetCents === "number" &&
      Number.isFinite(o.budgetCents) &&
      o.budgetCents >= 0
        ? Math.round(o.budgetCents)
        : null,
    groupSize,
    vibe:
      typeof o.vibe === "string" && o.vibe.trim()
        ? o.vibe.trim().slice(0, 40)
        : null,
  };
}

export function buildDraftShareMessage(
  criteria: MeetupPlanCriteria,
  optionName: string | null,
): string {
  const parts = [
    "Planning a meetup",
    criteria.vibe ? `(${criteria.vibe})` : null,
    criteria.activity ? `for ${criteria.activity}` : null,
    criteria.groupSize ? `· ~${criteria.groupSize} people` : null,
    criteria.city ? `in ${criteria.city}` : null,
    criteria.preferredDays.length
      ? `· ${criteria.preferredDays.join("/")}`
      : null,
    optionName ? `· looking at “${optionName}” from the catalog` : null,
    "— not a confirmed booking; reply if you want to join.",
  ].filter(Boolean);
  return parts.join(" ").slice(0, 2000);
}
