/**
 * Structured preferences extracted from free-text community posts.
 * Hours are local wall-clock (0–23), never silently treated as UTC.
 * Location fields are labels only — never precise addresses.
 */

import type { PostIntent } from "@/types/community-post";
import type { ActivityCategory } from "@/types/map-entities";
import type { DayOfWeek, SkillPreference } from "@/types/preferences";

/** How a field value was obtained. */
export type ExtractionFieldSource =
  | "stated"
  | "inferred"
  | "unknown"
  | "ambiguous";

export type ExtractionField<T> = {
  value: T | null;
  source: ExtractionFieldSource;
  /** Short explanation for the author (e.g. matched phrase). */
  note?: string | null;
};

/**
 * Parser engine identity — never claim LLM when deterministic.
 */
export type ExtractionEngine =
  | "deterministic-rules"
  | "unavailable";

export type ExtractedPostPreferences = {
  activity: ExtractionField<string>;
  category: ExtractionField<ActivityCategory>;
  /** City / metro label only — not a street address. */
  city: ExtractionField<string>;
  /** Neighborhood label only when clearly named. */
  neighborhood: ExtractionField<string>;
  preferredDays: ExtractionField<DayOfWeek[]>;
  /**
   * Local start hour 0–23 in the author's stated context.
   * Not a UTC instant; timezone IANA is advisory only.
   */
  timeStartHour: ExtractionField<number>;
  timeEndHour: ExtractionField<number>;
  /**
   * IANA zone the author may have implied (e.g. America/Los_Angeles for SF).
   * Never used to convert wall-clock hours into UTC for storage.
   */
  timeZoneHint: ExtractionField<string>;
  /** One or more intents when the text clearly supports them. */
  intents: ExtractionField<PostIntent[]>;
  skillLevel: ExtractionField<SkillPreference>;
  /** USD cents when an explicit budget/fee is stated; otherwise unknown. */
  budgetCents: ExtractionField<number>;
  radiusKm: ExtractionField<number>;
};

export type PostExtractionResult = {
  /** Engine that produced the result (honest labeling). */
  engine: ExtractionEngine;
  /** Human-readable limitation when no LLM is configured. */
  limitation: string | null;
  /** Echo of the original message (unchanged). */
  originalMessage: string;
  extracted: ExtractedPostPreferences;
  /**
   * Author-facing notes (ambiguity, missing calendar dates, dayparts without clock times).
   * Never invents values — only explains what was left unknown.
   */
  reviewNotes: string[];
  /**
   * Constraints mentioned in text that this product cannot store or match on
   * (demographics, guarantees, calendar dates, etc.).
   */
  unsupportedConstraints: string[];
  /**
   * Suggested draft fields for the composer (nulls omitted).
   * Only **stated** (non-ambiguous) values enter the draft — never soft guesses.
   * Author must confirm before publish — never auto-applied without UI confirm.
   */
  suggestedDraft: {
    activity: string | null;
    category: ActivityCategory | null;
    city: string | null;
    neighborhood: string | null;
    preferredDays: DayOfWeek[];
    timeStartHour: number | null;
    timeEndHour: number | null;
    intent: PostIntent | null;
    skillLevel: SkillPreference | null;
    budgetCents: number | null;
    radiusKm: number | null;
  };
};

/** Author corrections after reviewing extraction (message stays separate). */
export type PostExtractionConfirmation = {
  originalMessage: string;
  activity?: string | null;
  category?: ActivityCategory | null;
  city?: string | null;
  neighborhood?: string | null;
  preferredDays?: DayOfWeek[];
  timeStartHour?: number | null;
  timeEndHour?: number | null;
  intent?: PostIntent | null;
  skillLevel?: SkillPreference | null;
  budgetCents?: number | null;
  radiusKm?: number | null;
};
