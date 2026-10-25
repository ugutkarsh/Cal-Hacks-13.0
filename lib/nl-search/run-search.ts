/**
 * End-to-end NL map search against the real catalog (demo mock or Supabase).
 */

import { loadMapEntities } from "@/lib/data/map-entities";
import {
  parseNlSearchQuery,
  sanitizeNlCriteria,
} from "@/lib/nl-search/extract-query";
import { matchNlCatalog } from "@/lib/nl-search/match-catalog";
import type { GeoPoint } from "@/types/map-entities";
import type {
  NlSearchCriteria,
  NlSearchResponse,
} from "@/types/nl-search";

export type RunNlSearchInput = {
  message: string;
  /** When provided, skip re-parse and use edited criteria. */
  criteria?: unknown;
  /** Set true after the user reviews/edits criteria. */
  confirm?: boolean;
  timeZone?: string | null;
  searchCenter?: GeoPoint | null;
  forceDemo?: boolean;
};

export async function runNlSearch(
  input: RunNlSearchInput,
): Promise<NlSearchResponse | { ok: false; error: string }> {
  const message =
    typeof input.message === "string" ? input.message.trim().slice(0, 2000) : "";

  const parsed = message
    ? parseNlSearchQuery(message, { timeZone: input.timeZone })
    : null;

  let criteria: NlSearchCriteria;
  let needsReview: boolean;
  let reviewNotes: string[];
  let limitation: string | null;
  let engine: NlSearchResponse["engine"] = "deterministic-rules";

  if (input.criteria != null) {
    const sanitized = sanitizeNlCriteria(input.criteria);
    if (!sanitized) {
      return { ok: false, error: "Invalid criteria payload" };
    }
    criteria = sanitized;
    needsReview = false;
    reviewNotes = parsed?.reviewNotes ?? [];
    limitation = parsed?.limitation ?? null;
  } else if (parsed) {
    criteria = parsed.criteria;
    needsReview = parsed.needsReview;
    reviewNotes = parsed.reviewNotes;
    limitation = parsed.limitation;
    engine = parsed.engine;
  } else {
    return { ok: false, error: "Message or criteria required" };
  }

  // First pass with ambiguous/thin parse → return criteria for UI review.
  if (needsReview && input.confirm !== true && input.criteria == null) {
    return {
      ok: true,
      engine,
      llmConfigured: false,
      limitation,
      originalMessage: message,
      criteria,
      needsReview: true,
      reviewNotes,
      matches: [],
      emptyReason: null,
      dataSourceLabel: "Not searched yet — review criteria",
      searched: false,
    };
  }

  const loaded = await loadMapEntities(
    {
      search: "",
      category: "all",
      kinds: criteria.kinds,
    },
    { forceDemo: input.forceDemo },
  );

  if (loaded.error) {
    return { ok: false, error: loaded.error };
  }

  const center = input.searchCenter ?? null;

  const { matches, emptyReason } = matchNlCatalog(loaded.entities, criteria, {
    searchCenter: center,
    limit: 24,
  });

  return {
    ok: true,
    engine,
    llmConfigured: false,
    limitation,
    originalMessage: message || parsed?.originalMessage || "",
    criteria,
    needsReview: false,
    reviewNotes,
    matches,
    emptyReason,
    dataSourceLabel: loaded.meta.label,
    searched: true,
  };
}
