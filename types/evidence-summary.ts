/**
 * Evidence-grounded activity / venue summaries.
 * Rules-based paraphrase of authorized public review text + listing facts.
 * Never a trained model claim; never fabricated reviews.
 */

export type EvidenceSummaryEngine = "deterministic-rules" | "unavailable";

export type EvidenceSummaryStatus = "ok" | "insufficient";

export type EvidenceThemePolarity = "positive" | "concern" | "practical";

export type EvidenceThemeHit = {
  theme: string;
  label: string;
  polarity: EvidenceThemePolarity;
  /** Source review ids that contributed — never invented. */
  reviewIds: string[];
  /** Short excerpts from source comments (sanitized). */
  excerpts: string[];
  /**
   * Keyword-paraphrase of recurring language — clearly not a model invention.
   * Always accompanied by excerpts / review ids.
   */
  paraphrase: string;
};

export type EvidenceSourceRef = {
  id: string;
  authorName: string | null;
  rating: number | null;
  createdAt: string | null;
  excerpt: string;
};

/** Structured listing fields — source facts, not paraphrases. */
export type EvidenceListingFact = {
  label: string;
  value: string;
  source: "listing";
};

export type EvidenceSummary = {
  entityId: string;
  entityKind: "event" | "place";
  engine: EvidenceSummaryEngine;
  status: EvidenceSummaryStatus;
  /** Human-readable empty / limitation message when status !== ok. */
  emptyReason: string | null;
  limitation: string;
  /** Number of review records used (authorized public EventReview only). */
  sourceCount: number;
  dateRange: { earliest: string; latest: string } | null;
  positiveThemes: EvidenceThemeHit[];
  concernThemes: EvidenceThemeHit[];
  practicalDetails: EvidenceThemeHit[];
  sourceRefs: EvidenceSourceRef[];
  listingFacts: EvidenceListingFact[];
  /** Aggregate place rating from listing when present — fact, not a paraphrase. */
  listingAggregate: {
    rating: number;
    reviewCount: number;
  } | null;
  contentHash: string;
  generatedAt: string;
};

export type EvidenceSummaryCacheEntry = {
  hash: string;
  summary: EvidenceSummary;
  storedAt: string;
};
