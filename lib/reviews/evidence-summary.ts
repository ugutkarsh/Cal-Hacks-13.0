/**
 * Build evidence-grounded summaries from authorized public EventReview text
 * and structured listing fields only.
 *
 * Deterministic rules — not an LLM. Never fabricates reviews, quotes, ratings,
 * or reviewer identities. Never reads private activity_feedback / DMs.
 */

import { hashReviewEvidence } from "@/lib/reviews/evidence-hash";
import {
  looksLikePromptInjection,
  sanitizeReviewText,
} from "@/lib/reviews/sanitize-review-text";
import { summarizeReviewThemes } from "@/lib/reviews/themes";
import type {
  EvidenceListingFact,
  EvidenceSourceRef,
  EvidenceSummary,
  EvidenceThemeHit,
  EvidenceThemePolarity,
} from "@/types/evidence-summary";
import type {
  EventEntity,
  EventReview,
  PlaceEntity,
} from "@/types/map-entities";

const LIMITATION =
  "No LLM provider is configured. This summary uses deterministic keyword rules over authorized public listing reviews only — not a trained model. Private feedback and messages are never included.";

const MIN_USABLE_REVIEWS = 1;

type ThemeDef = {
  theme: string;
  label: string;
  polarity: EvidenceThemePolarity;
  pattern: RegExp;
  paraphrase: string;
};

const THEME_DEFS: ThemeDef[] = [
  {
    theme: "friendly_group",
    label: "Friendly group",
    polarity: "positive",
    pattern: /friendly|welcoming|welcome|kind|supportive|great\s+group|fun\s+group/i,
    paraphrase: "Reviewers often mention a friendly or welcoming group.",
  },
  {
    theme: "views_scenery",
    label: "Views / scenery",
    polarity: "positive",
    pattern: /view|scenery|scenic|beautiful|summit|landscape/i,
    paraphrase: "Reviewers mention views or scenery.",
  },
  {
    theme: "well_organized",
    label: "Well organized",
    polarity: "positive",
    pattern: /well[- ]?paced|organized|well[- ]?run|smooth|on\s+time/i,
    paraphrase: "Reviewers describe the outing as well paced or organized.",
  },
  {
    theme: "difficulty_concern",
    label: "Difficulty / conditions",
    polarity: "concern",
    pattern: /difficult|hard|steep|windy|challenging|tough|strenuous/i,
    paraphrase: "Some reviewers note difficulty or tough conditions.",
  },
  {
    theme: "crowds_concern",
    label: "Crowds",
    polarity: "concern",
    pattern: /crowd|busy|packed|too\s+many\s+people/i,
    paraphrase: "Some reviewers mention crowds or busyness.",
  },
  {
    theme: "cost_concern",
    label: "Cost",
    polarity: "concern",
    pattern: /expensive|pricey|costly|overpriced/i,
    paraphrase: "Some reviewers mention cost concerns.",
  },
  {
    theme: "bring_gear",
    label: "What to bring",
    polarity: "practical",
    pattern: /bring\s+layers|bring\s+water|wear\s+|pack\s+|layers|gear/i,
    paraphrase: "Reviewers share practical tips about gear or clothing.",
  },
  {
    theme: "pace_practical",
    label: "Pace",
    polarity: "practical",
    pattern: /\bpace\b|beginner[- ]friendly|moderate\s+pace/i,
    paraphrase: "Reviewers comment on pace or skill friendliness.",
  },
];

function excerpt(text: string): string {
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
}

function dateRangeFromReviews(
  reviews: EventReview[],
): { earliest: string; latest: string } | null {
  const dates = reviews
    .map((r) => r.createdAt)
    .filter((d): d is string => typeof d === "string" && d.length > 0)
    .sort();
  if (dates.length === 0) return null;
  return { earliest: dates[0], latest: dates[dates.length - 1] };
}

function collectThemes(reviews: EventReview[]): {
  positive: EvidenceThemeHit[];
  concern: EvidenceThemeHit[];
  practical: EvidenceThemeHit[];
} {
  const buckets = new Map<string, EvidenceThemeHit>();

  for (const review of reviews) {
    const raw = review.comment ?? "";
    // Injection text is scrubbed — never treated as instructions.
    const text = sanitizeReviewText(raw);
    if (!text) continue;
    for (const def of THEME_DEFS) {
      if (!def.pattern.test(text)) continue;
      const existing = buckets.get(def.theme) ?? {
        theme: def.theme,
        label: def.label,
        polarity: def.polarity,
        reviewIds: [],
        excerpts: [],
        paraphrase: def.paraphrase,
      };
      if (!existing.reviewIds.includes(review.id)) {
        existing.reviewIds.push(review.id);
        existing.excerpts.push(excerpt(text));
      }
      buckets.set(def.theme, existing);
    }
  }

  const all = Array.from(buckets.values());
  return {
    positive: all.filter((t) => t.polarity === "positive"),
    concern: all.filter((t) => t.polarity === "concern"),
    practical: all.filter((t) => t.polarity === "practical"),
  };
}

function toSourceRefs(reviews: EventReview[]): EvidenceSourceRef[] {
  return reviews.map((r) => ({
    id: r.id,
    authorName: r.authorName?.trim() || null,
    rating: typeof r.rating === "number" ? r.rating : null,
    createdAt: r.createdAt || null,
    excerpt: excerpt(sanitizeReviewText(r.comment ?? "")),
  }));
}

function eventListingFacts(entity: EventEntity): EvidenceListingFact[] {
  const facts: EvidenceListingFact[] = [];
  if (entity.locationLabel?.trim()) {
    facts.push({
      label: "Location",
      value: entity.locationLabel.trim(),
      source: "listing",
    });
  }
  if (entity.difficultyLabel?.trim()) {
    facts.push({
      label: "Listed difficulty",
      value: entity.difficultyLabel.trim(),
      source: "listing",
    });
  }
  if (entity.costCents != null) {
    facts.push({
      label: "Listed cost",
      value:
        entity.costCents === 0
          ? "Free (listing)"
          : `$${(entity.costCents / 100).toFixed(0)} (listing)`,
      source: "listing",
    });
  }
  facts.push({
    label: "Registration",
    value: entity.isRegistrationOpen
      ? "Listed as open"
      : "Listed as closed / unknown",
    source: "listing",
  });
  return facts;
}

function placeListingFacts(entity: PlaceEntity): EvidenceListingFact[] {
  const facts: EvidenceListingFact[] = [];
  if (entity.locationLabel?.trim()) {
    facts.push({
      label: "Location",
      value: entity.locationLabel.trim(),
      source: "listing",
    });
  }
  if (entity.amenities?.length) {
    facts.push({
      label: "Amenities (listing)",
      value: entity.amenities.join(", "),
      source: "listing",
    });
  }
  return facts;
}

function insufficient(
  entityId: string,
  entityKind: "event" | "place",
  reason: string,
  listingFacts: EvidenceListingFact[],
  listingAggregate: EvidenceSummary["listingAggregate"],
  contentHash: string,
): EvidenceSummary {
  return {
    entityId,
    entityKind,
    engine: "deterministic-rules",
    status: "insufficient",
    emptyReason: reason,
    limitation: LIMITATION,
    sourceCount: 0,
    dateRange: null,
    positiveThemes: [],
    concernThemes: [],
    practicalDetails: [],
    sourceRefs: [],
    listingFacts,
    listingAggregate,
    contentHash,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Summarize authorized public reviews on an event.
 * Does not invent reviews when the array is empty (live catalog case).
 */
export function buildEventEvidenceSummary(
  entity: EventEntity,
): EvidenceSummary {
  const reviews = Array.isArray(entity.reviews) ? entity.reviews : [];
  const listingFacts = eventListingFacts(entity);
  const contentHash = hashReviewEvidence(entity.id, reviews, entity.summary);

  const usable = reviews.filter((r) => {
    const text = sanitizeReviewText(r.comment ?? "");
    // Pure injection with no remaining evidence → not usable.
    if (!text) return false;
    if (looksLikePromptInjection(r.comment ?? "") && text.length < 8) {
      return false;
    }
    return true;
  });

  if (usable.length < MIN_USABLE_REVIEWS) {
    return insufficient(
      entity.id,
      "event",
      "Not enough feedback to summarize",
      listingFacts,
      null,
      contentHash,
    );
  }

  const themes = collectThemes(usable);
  const legacy = summarizeReviewThemes(usable);
  const hasThemeSignal =
    themes.positive.length +
      themes.concern.length +
      themes.practical.length >
      0 || legacy.themes.length > 0;

  if (!hasThemeSignal) {
    // Reviews exist but no supported themes — still insufficient for a themed summary.
    return {
      ...insufficient(
        entity.id,
        "event",
        "Not enough feedback to summarize — reviews exist but no recurring themes matched.",
        listingFacts,
        null,
        contentHash,
      ),
      sourceCount: usable.length,
      dateRange: dateRangeFromReviews(usable),
      sourceRefs: toSourceRefs(usable),
    };
  }

  return {
    entityId: entity.id,
    entityKind: "event",
    engine: "deterministic-rules",
    status: "ok",
    emptyReason: null,
    limitation: LIMITATION,
    sourceCount: usable.length,
    dateRange: dateRangeFromReviews(usable),
    positiveThemes: themes.positive,
    concernThemes: themes.concern,
    practicalDetails: themes.practical,
    sourceRefs: toSourceRefs(usable),
    listingFacts,
    listingAggregate: null,
    contentHash,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Places have no review text in the live schema — only optional aggregate rating.
 * Never invent review quotes from rating counts.
 */
export function buildPlaceEvidenceSummary(
  entity: PlaceEntity,
): EvidenceSummary {
  const listingFacts = placeListingFacts(entity);
  const aggregate =
    entity.rating != null && entity.reviewCount > 0
      ? { rating: entity.rating, reviewCount: entity.reviewCount }
      : null;
  const contentHash = hashReviewEvidence(
    entity.id,
    [],
    `${entity.rating ?? ""}:${entity.reviewCount}:${entity.summary}`,
  );

  // Aggregate alone is a listing fact — not enough review text to paraphrase.
  return insufficient(
    entity.id,
    "place",
    aggregate
      ? "Not enough feedback to summarize — listing shows an aggregate rating only (no review text available)."
      : "Not enough feedback to summarize",
    listingFacts,
    aggregate,
    contentHash,
  );
}

export function buildEvidenceSummaryForEntity(
  entity: EventEntity | PlaceEntity,
): EvidenceSummary {
  if (entity.kind === "event") return buildEventEvidenceSummary(entity);
  return buildPlaceEvidenceSummary(entity);
}
