/**
 * Map natural-language → editable NlSearchCriteria.
 * Reuses the community deterministic-rules extractor; never labeled as an LLM.
 */

import {
  extractPostPreferences,
  softDaypartHours,
} from "@/lib/community/extract-preferences";
import type { EntityKind } from "@/types/map-entities";
import type {
  NlSearchCriteria,
  NlSearchParseResult,
} from "@/types/nl-search";

const LIMITATION =
  "No LLM provider is configured. Natural-language match uses a deterministic rules parser (not an LLM). Review criteria before searching the catalog.";

function emptyCriteria(): NlSearchCriteria {
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
    kinds: ["event", "place", "person"],
    useNearMe: false,
  };
}

/** Infer map kinds from intents + phrasing (event / venue / people). */
export function inferTargetKinds(
  message: string,
  intents: string[] | null,
): EntityKind[] {
  const text = message.toLowerCase();
  const kinds = new Set<EntityKind>();

  const wantPeople =
    (intents?.includes("find_teammates") ?? false) ||
    /\bmeet\s+people\b|\bplayers?\b|\bpartners?\b|\bteammates?\b|\bwho\s+enjoy\b|\bfind(?:ing)?\s+\w+\s+players?\b/i.test(
      text,
    );
  const wantVenue =
    (intents?.includes("find_venue") ?? false) ||
    /\bvenue\b|\bcourt\b|\bgym\b|\btrails?\b|\bnear\s+me\b.*\b(hike|trail)\b|\bhiking\s+trails?\b/i.test(
      text,
    );
  const wantEvent =
    (intents?.includes("join_activity") ?? false) ||
    /\bgame\b|\bevent\b|\bmeetup\b|\bsession\b|\bclass\b|\bjoin\b/i.test(text);

  if (wantPeople) kinds.add("person");
  if (wantVenue) kinds.add("place");
  if (wantEvent) kinds.add("event");

  // “easy hike near me” → place + event (trail + group hikes)
  if (/\bhik(?:e|ing)\b/i.test(text)) {
    kinds.add("place");
    kinds.add("event");
  }

  // Activity named without people/venue → prefer events, keep places as soft
  if (kinds.size === 0 && /\b(badminton|pickleball|soccer|football|tennis|yoga|run|cycle|climb|photograph)/i.test(text)) {
    kinds.add("event");
    kinds.add("place");
  }

  if (kinds.size === 0) {
    return ["event", "place", "person"];
  }
  return [...kinds];
}

export function parseNlSearchQuery(
  message: string,
  options?: { timeZone?: string | null },
): NlSearchParseResult {
  const originalMessage = typeof message === "string" ? message : "";
  const trimmed = originalMessage.trim().slice(0, 2000);

  if (!trimmed) {
    return {
      engine: "deterministic-rules",
      limitation: LIMITATION,
      originalMessage,
      criteria: emptyCriteria(),
      needsReview: true,
      reviewNotes: ["Enter a request describing an activity, place, or people to meet."],
    };
  }

  const extracted = extractPostPreferences(trimmed, options);
  const ex = extracted.extracted;
  const draft = extracted.suggestedDraft;

  const useNearMe = /\bnear\s+me\b|\bnearby\b|\bclose\s+by\b/i.test(trimmed);

  const intents = ex.intents.value;
  const kinds = inferTargetKinds(
    trimmed,
    intents?.map(String) ?? null,
  );

  // Soft dayparts apply to search criteria only — never written onto community posts.
  const daypart =
    draft.timeStartHour == null && draft.timeEndHour == null
      ? softDaypartHours(trimmed)
      : null;

  // “easy hike” soft skill stays search-only (posts strip inferred skill on confirm).
  const searchSkill =
    draft.skillLevel ??
    (ex.skillLevel.source === "inferred" ? ex.skillLevel.value : null);

  const criteria: NlSearchCriteria = {
    activity: draft.activity,
    category: draft.category,
    city: useNearMe && !draft.city ? null : draft.city,
    neighborhood: draft.neighborhood,
    preferredDays: draft.preferredDays ?? [],
    timeStartHour: draft.timeStartHour ?? daypart?.start ?? null,
    timeEndHour: draft.timeEndHour ?? daypart?.end ?? null,
    skillLevel: searchSkill,
    budgetCents:
      ex.budgetCents.source === "stated" ? ex.budgetCents.value : null,
    kinds,
    useNearMe,
  };

  const reviewNotes: string[] = [];
  if (ex.activity.source === "ambiguous") {
    reviewNotes.push(ex.activity.note ?? "Multiple activities mentioned — pick one.");
  }
  if (ex.city.source === "ambiguous") {
    reviewNotes.push(ex.city.note ?? "Multiple cities mentioned — pick one.");
  }
  if (!criteria.activity && !criteria.category && criteria.kinds.includes("person") === false) {
    reviewNotes.push("No clear activity detected — add one or rely on category filters.");
  }
  if (!criteria.city && !useNearMe) {
    reviewNotes.push(
      "No city detected — results use catalog location labels only, or enable near-me with a saved starting point.",
    );
  }
  if (useNearMe) {
    reviewNotes.push(
      "“Near me” uses your saved discovery starting point when available — not live GPS unless you set a location in preferences.",
    );
  }

  // Unsupported constraints we explicitly do not invent
  if (/\bguaranteed\s+spot\b|\bonly\s+women\b|\bage\s+\d+/i.test(trimmed)) {
    reviewNotes.push(
      "Some constraints in your request (availability guarantees / demographics) are not searchable — ignored.",
    );
  }

  const needsReview =
    reviewNotes.length > 0 ||
    ex.activity.source === "ambiguous" ||
    ex.city.source === "ambiguous" ||
    (!criteria.activity && !criteria.category && !criteria.city && !useNearMe);

  return {
    engine: "deterministic-rules",
    limitation: LIMITATION,
    originalMessage,
    criteria,
    needsReview,
    reviewNotes,
  };
}

/** Clamp / normalize user-edited criteria from the review UI. */
export function sanitizeNlCriteria(raw: unknown): NlSearchCriteria | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const kindsRaw = Array.isArray(o.kinds) ? o.kinds : ["event", "place", "person"];
  const kinds = kindsRaw.filter(
    (k): k is EntityKind =>
      k === "event" || k === "place" || k === "person",
  );
  const days = Array.isArray(o.preferredDays)
    ? o.preferredDays.filter(
        (d): d is NlSearchCriteria["preferredDays"][number] =>
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
      ? (o.category as NlSearchCriteria["category"])
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
    kinds: kinds.length > 0 ? kinds : ["event", "place", "person"],
    useNearMe: o.useNearMe === true,
  };
}
