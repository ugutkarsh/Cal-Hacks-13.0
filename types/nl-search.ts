/**
 * Natural-language map search — structured criteria + catalog match results.
 * Engine is deterministic-rules unless an LLM is later configured (none today).
 */

import type { ExtractionEngine } from "@/types/community-extract";
import type {
  ActivityCategory,
  EntityKind,
  GeoPoint,
} from "@/types/map-entities";
import type { DayOfWeek, SkillPreference } from "@/types/preferences";
import type { RecommendationReason } from "@/types/recommendations";

/** Editable criteria after parse (user may correct before catalog search). */
export type NlSearchCriteria = {
  activity: string | null;
  category: ActivityCategory | null;
  city: string | null;
  neighborhood: string | null;
  preferredDays: DayOfWeek[];
  timeStartHour: number | null;
  timeEndHour: number | null;
  skillLevel: SkillPreference | null;
  budgetCents: number | null;
  /** Which map entity kinds to search. */
  kinds: EntityKind[];
  /** Use prefs starting point when city is "near me" / missing. */
  useNearMe: boolean;
};

export type NlSearchParseResult = {
  engine: ExtractionEngine;
  limitation: string | null;
  originalMessage: string;
  criteria: NlSearchCriteria;
  /** True when the user should review (ambiguous / thin criteria). */
  needsReview: boolean;
  reviewNotes: string[];
};

export type NlSearchMatch = {
  id: string;
  kind: EntityKind;
  name: string;
  summary: string;
  category: ActivityCategory;
  locationLabel: string;
  coordinates: GeoPoint | null;
  score: number;
  reasons: RecommendationReason[];
};

export type NlSearchResponse = {
  ok: true;
  engine: ExtractionEngine;
  llmConfigured: false;
  limitation: string | null;
  originalMessage: string;
  criteria: NlSearchCriteria;
  needsReview: boolean;
  reviewNotes: string[];
  /** Populated when search ran against the catalog (confirm or clear criteria). */
  matches: NlSearchMatch[];
  emptyReason: string | null;
  dataSourceLabel: string;
  searched: boolean;
};

export type NlSearchErrorResponse = {
  ok: false;
  error: string;
};
