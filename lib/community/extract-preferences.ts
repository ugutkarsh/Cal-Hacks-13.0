/**
 * Deterministic natural-language → structured post preferences.
 * NOT an LLM. Labeled `deterministic-rules`. No invented skill/budget/dates.
 * Hours are local wall-clock; never converted to UTC for storage.
 */

import type {
  ExtractedPostPreferences,
  ExtractionField,
  ExtractionFieldSource,
  PostExtractionResult,
} from "@/types/community-extract";
import type { PostIntent } from "@/types/community-post";
import type { ActivityCategory } from "@/types/map-entities";
import type { DayOfWeek, SkillPreference } from "@/types/preferences";

const MAX_MESSAGE = 2000;

const ACTIVITY_PATTERNS: Array<{
  re: RegExp;
  activity: string;
  category: ActivityCategory;
}> = [
  { re: /\bbadminton\b/i, activity: "badminton", category: "sports" },
  { re: /\bpickleball\b/i, activity: "pickleball", category: "sports" },
  { re: /\btennis\b/i, activity: "tennis", category: "sports" },
  { re: /\bsoccer\b|\bfootball\b/i, activity: "soccer", category: "sports" },
  { re: /\bbasketball\b/i, activity: "basketball", category: "sports" },
  { re: /\byoga\b/i, activity: "yoga", category: "sports" },
  { re: /\bhik(?:e|ing)\b/i, activity: "hiking", category: "hiking" },
  { re: /\brun(?:ning)?\b|\bjogg(?:er|ing)\b/i, activity: "running", category: "running" },
  { re: /\bcycl(?:e|ing)\b|\bbik(?:e|ing)\b/i, activity: "cycling", category: "cycling" },
  { re: /\bclimb(?:ing)?\b|\bbouldering\b/i, activity: "climbing", category: "climbing" },
  {
    re: /\bphotograph(?:y|er|ers)?\b|\bphoto\s*walk\b/i,
    activity: "photography",
    category: "meetup",
  },
];

const CITY_PATTERNS: Array<{
  re: RegExp;
  city: string;
  timeZoneHint: string;
}> = [
  {
    re: /\b(?:san\s*francisco|s\.?\s*f\.?)\b/i,
    city: "San Francisco",
    timeZoneHint: "America/Los_Angeles",
  },
  {
    re: /\bsf\b/i,
    city: "San Francisco",
    timeZoneHint: "America/Los_Angeles",
  },
  {
    re: /\boakland\b/i,
    city: "Oakland",
    timeZoneHint: "America/Los_Angeles",
  },
  {
    re: /\bberkeley\b/i,
    city: "Berkeley",
    timeZoneHint: "America/Los_Angeles",
  },
  {
    re: /\bsan\s*jose\b/i,
    city: "San Jose",
    timeZoneHint: "America/Los_Angeles",
  },
  {
    re: /\bpalo\s*alto\b/i,
    city: "Palo Alto",
    timeZoneHint: "America/Los_Angeles",
  },
  {
    re: /\bnew\s*york(?:\s*city)?\b|\bnyc\b/i,
    city: "New York",
    timeZoneHint: "America/New_York",
  },
  {
    re: /\blondon\b/i,
    city: "London",
    timeZoneHint: "Europe/London",
  },
];

/** Neighborhoods only when clearly named — never street addresses. */
const NEIGHBORHOOD_PATTERNS: Array<{ re: RegExp; neighborhood: string }> = [
  { re: /\bmission(?:\s*district)?\b/i, neighborhood: "Mission" },
  { re: /\bsoma\b/i, neighborhood: "SoMa" },
  { re: /\bmarina\b/i, neighborhood: "Marina" },
  { re: /\bhaight\b/i, neighborhood: "Haight" },
  { re: /\brockridge\b/i, neighborhood: "Rockridge" },
];

const DAY_ALIASES: Array<{ re: RegExp; day: DayOfWeek }> = [
  { re: /\bmondays?\b|\bmon\b/i, day: "mon" },
  { re: /\btuesdays?\b|\btues?\b/i, day: "tue" },
  { re: /\bwednesdays?\b|\bweds?\b/i, day: "wed" },
  { re: /\bthursdays?\b|\bthurs?\b|\bthu\b/i, day: "thu" },
  { re: /\bfridays?\b|\bfri\b/i, day: "fri" },
  { re: /\bsaturdays?\b|\bsat\b/i, day: "sat" },
  { re: /\bsundays?\b|\bsun\b/i, day: "sun" },
  { re: /\bweekends?\b/i, day: "sat" }, // weekend expands below
];

function field<T>(
  value: T | null,
  source: ExtractionFieldSource,
  note?: string | null,
): ExtractionField<T> {
  return { value, source, note: note ?? null };
}

function unknownField<T>(): ExtractionField<T> {
  return field<T>(null, "unknown", null);
}

/** Parse "5 PM", "5pm", "17:00", "5-9pm", "between 5 and 9 PM". */
export function parseLocalTimeHour(token: string): number | null {
  const t = token.trim().toLowerCase().replace(/\s+/g, " ");
  const ampm = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (ampm) {
    let h = Number(ampm[1]);
    const mer = ampm[3].toLowerCase();
    if (h < 1 || h > 12) return null;
    if (mer === "am") {
      if (h === 12) h = 0;
    } else if (h !== 12) {
      h += 12;
    }
    return h;
  }
  const h24 = t.match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (h24) {
    const h = Number(h24[1]);
    if (h >= 0 && h <= 23) return h;
  }
  return null;
}

function extractTimeWindow(text: string): {
  start: ExtractionField<number>;
  end: ExtractionField<number>;
} {
  // between 5 and 9 PM / from 5 to 9pm / 5–9 PM / 5-9pm
  const between = text.match(
    /\bbetween\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s+and\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
  );
  if (between) {
    let startTok = between[1].trim();
    const endTok = between[2].trim();
    // Propagate PM/AM from end onto start when start lacks meridian.
    if (!/(am|pm)/i.test(startTok) && /(am|pm)/i.test(endTok)) {
      const mer = endTok.match(/(am|pm)/i)![1];
      startTok = `${startTok} ${mer}`;
    }
    const start = parseLocalTimeHour(startTok);
    const end = parseLocalTimeHour(endTok);
    if (start != null && end != null) {
      return {
        start: field(start, "stated", `Matched “${between[0]}” (local wall-clock)`),
        end: field(end, "stated", `Matched “${between[0]}” (local wall-clock)`),
      };
    }
  }

  const range = text.match(
    /\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:[-–—]|to)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i,
  );
  if (range) {
    let startTok = range[1].trim();
    const endTok = range[2].trim();
    if (!/(am|pm)/i.test(startTok) && /(am|pm)/i.test(endTok)) {
      const mer = endTok.match(/(am|pm)/i)![1];
      startTok = `${startTok} ${mer}`;
    }
    // Bare integers without meridian only accepted as 24h when both look like hours.
    const start = parseLocalTimeHour(startTok);
    const end = parseLocalTimeHour(endTok);
    if (start != null && end != null) {
      return {
        start: field(start, "stated", `Matched “${range[0]}” (local wall-clock)`),
        end: field(end, "stated", `Matched “${range[0]}” (local wall-clock)`),
      };
    }
  }

  const single = text.match(
    /\b(?:at|around|after|before)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i,
  );
  if (single) {
    const hour = parseLocalTimeHour(single[1]);
    if (hour != null) {
      return {
        start: field(hour, "stated", `Matched “${single[0]}”`),
        end: unknownField(),
      };
    }
  }

  // Dayparts without clock times — do NOT invent hours (author must enter times).
  if (/\bafter\s+work\b|\bevenings?\b/i.test(text)) {
    return {
      start: field<number>(
        null,
        "unknown",
        "Evening / after work mentioned — no clock times stated",
      ),
      end: field<number>(
        null,
        "unknown",
        "Evening / after work mentioned — no clock times stated",
      ),
    };
  }
  if (/\bmornings?\b/i.test(text)) {
    return {
      start: field<number>(
        null,
        "unknown",
        "Morning mentioned — no clock times stated",
      ),
      end: field<number>(
        null,
        "unknown",
        "Morning mentioned — no clock times stated",
      ),
    };
  }
  if (/\bafternoons?\b/i.test(text)) {
    return {
      start: field<number>(
        null,
        "unknown",
        "Afternoon mentioned — no clock times stated",
      ),
      end: field<number>(
        null,
        "unknown",
        "Afternoon mentioned — no clock times stated",
      ),
    };
  }

  return { start: unknownField(), end: unknownField() };
}

function extractDays(text: string): ExtractionField<DayOfWeek[]> {
  const days: DayOfWeek[] = [];
  const notes: string[] = [];

  if (/\bweekends?\b/i.test(text)) {
    if (!days.includes("sat")) days.push("sat");
    if (!days.includes("sun")) days.push("sun");
    notes.push("weekend");
  }
  if (/\bweekdays?\b/i.test(text)) {
    for (const d of ["mon", "tue", "wed", "thu", "fri"] as DayOfWeek[]) {
      if (!days.includes(d)) days.push(d);
    }
    notes.push("weekdays");
  }

  for (const { re, day } of DAY_ALIASES) {
    if (day === "sat" && /\bweekends?\b/i.test(text) && re.source.includes("weekend")) {
      continue;
    }
    if (re.test(text) && !days.includes(day)) {
      // Avoid double-adding sat from weekend alias pattern
      if (re.source.includes("weekend")) continue;
      days.push(day);
      notes.push(day);
    }
  }

  // "Saturdays or Sundays"
  if (days.length === 0) return unknownField();
  return field(days, "stated", `Matched days: ${notes.join(", ") || days.join(", ")}`);
}

function extractIntents(text: string): ExtractionField<PostIntent[]> {
  const intents: PostIntent[] = [];
  const notes: string[] = [];

  if (
    /\b(?:looking\s+to\s+play|need(?:s|ed)?\s+another\s+player|find(?:ing)?\s+(?:a\s+)?(?:partner|teammate|player)|anyone\s+(?:want|free|down)|looking\s+for\s+(?:a\s+)?(?:partner|teammate|player)|meet\s+people|find(?:ing)?\s+(?:\w+\s+)?players?)\b/i.test(
      text,
    ) ||
    /\bneed(?:s)?\s+another\s+player\b/i.test(text)
  ) {
    intents.push("find_teammates");
    notes.push("teammates/player");
  }

  if (
    /\b(?:know(?:s|n)?\s+a\s+place|looking\s+for\s+(?:a\s+)?(?:court|gym|venue|place)|where\s+(?:can|to)\s+play|find(?:ing)?\s+(?:a\s+)?(?:venue|court|gym))\b/i.test(
      text,
    )
  ) {
    intents.push("find_venue");
    notes.push("venue/place");
  }

  if (
    /\b(?:join(?:ing)?\s+(?:an?\s+)?(?:existing\s+)?(?:game|group|session|activity)|looking\s+to\s+join)\b/i.test(
      text,
    )
  ) {
    intents.push("join_activity");
    notes.push("join");
  }

  if (
    /\b(?:organiz(?:e|ing)|host(?:ing)?|put(?:ting)?\s+together)\b/i.test(text)
  ) {
    intents.push("organize_meetup");
    notes.push("organize");
  }

  // Do not soft-infer intent from vague “looking to play” alone.
  if (intents.length === 0) return unknownField();
  return field(intents, "stated", `Matched: ${notes.join(", ")}`);
}

function extractSkill(text: string): ExtractionField<SkillPreference> {
  if (/\bbeginners?\b|beginner-friendly\b/i.test(text)) {
    return field("beginner", "stated", "Matched “beginner”");
  }
  if (/\beasy\s+(?:hike|trail|walk|run|ride)\b|\ban\s+easy\s+hike\b/i.test(text)) {
    return field("beginner", "inferred", "“easy …” activity phrasing → beginner");
  }
  if (/\bintermediate\b/i.test(text)) {
    return field("intermediate", "stated", "Matched “intermediate”");
  }
  if (/\badvanced\b/i.test(text)) {
    return field("advanced", "stated", "Matched “advanced”");
  }
  if (/\bany\s+level\b|\ball\s+levels?\b/i.test(text)) {
    return field("any", "stated", "Matched any-level phrasing");
  }
  // Explicitly do NOT invent skill from "new in city"
  return unknownField();
}

function extractBudget(text: string): ExtractionField<number> {
  const money = text.match(
    /\$\s*(\d+(?:\.\d{1,2})?)|\b(\d+)\s*(?:usd|dollars?)\b/i,
  );
  if (money) {
    const amount = Number(money[1] ?? money[2]);
    if (Number.isFinite(amount) && amount >= 0) {
      return field(
        Math.round(amount * 100),
        "stated",
        `Matched budget “${money[0]}”`,
      );
    }
  }
  if (/\bfree\b|\bno\s+cost\b|\b\$0\b/i.test(text)) {
    return field(0, "stated", "Matched free / $0");
  }
  return unknownField();
}

function extractLocation(text: string): {
  city: ExtractionField<string>;
  neighborhood: ExtractionField<string>;
  timeZoneHint: ExtractionField<string>;
} {
  // Reject precise street patterns — never promote to city.
  const streetLike =
    /\b\d{1,5}\s+[A-Za-z]+(?:\s+[A-Za-z]+)?\s+(?:st|street|ave|avenue|blvd|road|rd|dr|drive)\b/i.test(
      text,
    );

  const citiesFound: Array<{ city: string; timeZoneHint: string }> = [];
  for (const p of CITY_PATTERNS) {
    if (p.re.test(text)) {
      if (!citiesFound.some((c) => c.city === p.city)) {
        citiesFound.push({ city: p.city, timeZoneHint: p.timeZoneHint });
      }
    }
  }

  let neighborhood: ExtractionField<string> = unknownField();
  for (const p of NEIGHBORHOOD_PATTERNS) {
    if (p.re.test(text)) {
      neighborhood = field(p.neighborhood, "stated", `Matched “${p.neighborhood}”`);
      break;
    }
  }

  if (streetLike) {
    return {
      city:
        citiesFound.length === 1
          ? field(
              citiesFound[0].city,
              "stated",
              "City label only — street-like text ignored (no precise address)",
            )
          : citiesFound.length > 1
            ? field<string>(
                null,
                "ambiguous",
                "Multiple cities mentioned; confirm one",
              )
            : unknownField(),
      neighborhood,
      timeZoneHint:
        citiesFound.length === 1
          ? field(
              citiesFound[0].timeZoneHint,
              "inferred",
              "Advisory IANA zone from city — hours stay local wall-clock",
            )
          : unknownField(),
    };
  }

  if (citiesFound.length > 1) {
    return {
      city: field<string>(
        null,
        "ambiguous",
        `Multiple cities: ${citiesFound.map((c) => c.city).join(", ")}`,
      ),
      neighborhood,
      timeZoneHint: unknownField(),
    };
  }

  if (citiesFound.length === 1) {
    return {
      city: field(citiesFound[0].city, "stated", `Matched “${citiesFound[0].city}”`),
      neighborhood,
      timeZoneHint: field(
        citiesFound[0].timeZoneHint,
        "inferred",
        "Advisory IANA zone from city — hours stay local wall-clock, not converted to UTC",
      ),
    };
  }

  // Generic "in <Word>" — never invent a city label; leave unknown for author confirm.
  const inPlace = text.match(
    /\b(?:in|near|around)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/,
  );
  if (inPlace) {
    const label = inPlace[1].trim();
    if (
      !/^(Saturday|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|January|February|March|April|May|June|July|August|September|October|November|December)$/i.test(
        label,
      )
    ) {
      return {
        city: field<string>(
          null,
          "unknown",
          `Possible place “${label}” mentioned — confirm city; not auto-filled`,
        ),
        neighborhood,
        timeZoneHint: unknownField(),
      };
    }
  }

  return {
    city: unknownField(),
    neighborhood,
    timeZoneHint: unknownField(),
  };
}

function extractActivity(text: string): {
  activity: ExtractionField<string>;
  category: ExtractionField<ActivityCategory>;
} {
  const hits = ACTIVITY_PATTERNS.filter((p) => p.re.test(text));
  if (hits.length === 0) {
    return { activity: unknownField(), category: unknownField() };
  }
  if (hits.length > 1) {
    // Prefer first match but mark ambiguous if truly different activities
    const unique = [...new Set(hits.map((h) => h.activity))];
    if (unique.length > 1) {
      return {
        activity: field<string>(
          null,
          "ambiguous",
          `Multiple activities: ${unique.join(", ")}`,
        ),
        category: unknownField(),
      };
    }
  }
  const hit = hits[0];
  return {
    activity: field(hit.activity, "stated", `Matched “${hit.activity}”`),
    category: field(hit.category, "inferred", `Category from activity “${hit.activity}”`),
  };
}

function emptyExtracted(): ExtractedPostPreferences {
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

const LIMITATION =
  "No LLM provider is configured in this project. Extraction uses a deterministic rules parser (not an LLM). Confirm or correct fields before publishing.";

/** Soft daypart wall-clock ranges for search/planner only — never stored on posts. */
export function softDaypartHours(
  text: string,
): { start: number; end: number; note: string } | null {
  if (/\bafter\s+work\b|\bevenings?\b/i.test(text)) {
    return {
      start: 17,
      end: 21,
      note: "Soft evening / after-work window for search only (not stored)",
    };
  }
  if (/\bmornings?\b/i.test(text)) {
    return { start: 6, end: 11, note: "Soft morning window for search only" };
  }
  if (/\bafternoons?\b/i.test(text)) {
    return {
      start: 12,
      end: 17,
      note: "Soft afternoon window for search only",
    };
  }
  return null;
}

function collectUnsupportedConstraints(text: string): string[] {
  const out: string[] = [];
  if (/\bguaranteed\s+spot\b|\bguaranteed\s+availability\b/i.test(text)) {
    out.push("Availability guarantees are not searchable or stored.");
  }
  if (
    /\bonly\s+women\b|\bwomen[- ]only\b|\bmen[- ]only\b|\bage\s+\d+|\bunder\s+\d+\b|\bover\s+\d+\b/i.test(
      text,
    )
  ) {
    out.push(
      "Demographic constraints (age / gender) are not extracted or matched.",
    );
  }
  if (
    /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?\b|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b|\bon\s+(?:the\s+)?\d{1,2}(?:st|nd|rd|th)\b/i.test(
      text,
    )
  ) {
    out.push(
      "Specific calendar dates are not stored — only day-of-week preferences when stated.",
    );
  }
  if (/\bmust\s+bring\b|\bequipment\s+provided\b|\bwheelchair\b|\bada\b/i.test(text)) {
    out.push(
      "Equipment / accessibility notes are kept in the message only — not structured filters.",
    );
  }
  return out;
}

function buildReviewNotes(
  text: string,
  extracted: ExtractedPostPreferences,
  unsupported: string[],
): string[] {
  const notes: string[] = [];
  if (extracted.activity.source === "ambiguous") {
    notes.push(
      extracted.activity.note ??
        "Multiple activities mentioned — pick one before publishing.",
    );
  }
  if (extracted.city.source === "ambiguous") {
    notes.push(
      extracted.city.note ?? "Multiple cities mentioned — pick one.",
    );
  }
  if (
    extracted.city.source === "unknown" &&
    extracted.city.note?.includes("Possible place")
  ) {
    notes.push(extracted.city.note);
  }
  if (
    extracted.timeStartHour.source === "unknown" &&
    extracted.timeStartHour.note?.includes("no clock times")
  ) {
    notes.push(extracted.timeStartHour.note);
  }
  if (
    !extracted.preferredDays.value?.length &&
    !/\b(?:mon|tue|wed|thu|fri|sat|sun|weekday|weekend)/i.test(text)
  ) {
    notes.push(
      "No day-of-week preference detected — leave blank or set days manually.",
    );
  }
  for (const u of unsupported) notes.push(u);
  return notes;
}

function statedOnly<T>(
  f: ExtractionField<T>,
): T | null {
  return f.source === "stated" && f.value != null ? f.value : null;
}

/**
 * Parse free-text into structured preferences.
 * User text never drives SQL, prompts, or permissions — pure function only.
 */
export function extractPostPreferences(
  message: string,
  options?: { timeZone?: string | null },
): PostExtractionResult {
  const originalMessage = typeof message === "string" ? message : "";
  const trimmed = originalMessage.trim().slice(0, MAX_MESSAGE);

  if (!trimmed) {
    return {
      engine: "deterministic-rules",
      limitation: LIMITATION,
      originalMessage,
      extracted: emptyExtracted(),
      reviewNotes: ["Enter a message describing the activity you want."],
      unsupportedConstraints: [],
      suggestedDraft: {
        activity: null,
        category: null,
        city: null,
        neighborhood: null,
        preferredDays: [],
        timeStartHour: null,
        timeEndHour: null,
        intent: null,
        skillLevel: null,
        budgetCents: null,
        radiusKm: null,
      },
    };
  }

  const { activity, category } = extractActivity(trimmed);
  const location = extractLocation(trimmed);
  const preferredDays = extractDays(trimmed);
  const times = extractTimeWindow(trimmed);
  const intents = extractIntents(trimmed);
  const skillLevel = extractSkill(trimmed);
  const budgetCents = extractBudget(trimmed);

  // Client-supplied timezone is advisory only — never rewrite hours as UTC.
  let timeZoneHint = location.timeZoneHint;
  if (
    timeZoneHint.source === "unknown" &&
    options?.timeZone &&
    typeof options.timeZone === "string" &&
    /^[A-Za-z_]+\/[A-Za-z_]+$/.test(options.timeZone)
  ) {
    timeZoneHint = field(
      options.timeZone,
      "inferred",
      "Client IANA zone hint — wall-clock hours not converted to UTC",
    );
  }

  const extracted: ExtractedPostPreferences = {
    activity,
    category,
    city: location.city,
    neighborhood: location.neighborhood,
    preferredDays,
    timeStartHour: times.start,
    timeEndHour: times.end,
    timeZoneHint,
    intents,
    skillLevel,
    budgetCents,
    radiusKm: unknownField(), // never invent radius
  };

  const unsupportedConstraints = collectUnsupportedConstraints(trimmed);
  const reviewNotes = buildReviewNotes(
    trimmed,
    extracted,
    unsupportedConstraints,
  );

  // Draft: stated values only (category may follow stated activity).
  const primaryIntent =
    intents.source === "stated" && intents.value && intents.value.length > 0
      ? intents.value[0]
      : null;

  return {
    engine: "deterministic-rules",
    limitation: LIMITATION,
    originalMessage,
    extracted,
    reviewNotes,
    unsupportedConstraints,
    suggestedDraft: {
      activity:
        activity.source === "stated" ? activity.value : null,
      category:
        activity.source === "stated" && category.source !== "ambiguous"
          ? category.value
          : null,
      city: statedOnly(location.city),
      neighborhood: statedOnly(location.neighborhood),
      preferredDays:
        preferredDays.source === "stated" ? (preferredDays.value ?? []) : [],
      timeStartHour: statedOnly(times.start),
      timeEndHour: statedOnly(times.end),
      intent: primaryIntent,
      skillLevel: statedOnly(skillLevel),
      budgetCents: statedOnly(budgetCents),
      radiusKm: null,
    },
  };
}

/** Honest unavailable result when extraction cannot run. */
export function unavailablePostExtraction(
  message: string,
  reason?: string,
): PostExtractionResult {
  const originalMessage = typeof message === "string" ? message : "";
  return {
    engine: "unavailable",
    limitation:
      reason ??
      "Extraction is temporarily unavailable. You can still publish with your original message and fill structured fields manually.",
    originalMessage,
    extracted: emptyExtracted(),
    reviewNotes: [
      "Extraction unavailable — structured fields were not suggested. Your message is unchanged.",
    ],
    unsupportedConstraints: [],
    suggestedDraft: {
      activity: null,
      category: null,
      city: null,
      neighborhood: null,
      preferredDays: [],
      timeStartHour: null,
      timeEndHour: null,
      intent: null,
      skillLevel: null,
      budgetCents: null,
      radiusKm: null,
    },
  };
}
