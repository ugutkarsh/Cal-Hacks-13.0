import type { EventReview } from "@/types/map-entities";
import type { ReviewTheme, ReviewThemeHit, ReviewThemeSummary } from "@/types/reviews";

const THEME_PATTERNS: { theme: ReviewTheme; label: string; pattern: RegExp }[] =
  [
    {
      theme: "difficulty",
      label: "Difficulty",
      pattern: /difficult|hard|easy|moderate|pace|beginner|advanced|windy|steep/i,
    },
    {
      theme: "cost",
      label: "Cost",
      pattern: /cost|price|fee|cheap|expensive|free|budget|\$/i,
    },
    {
      theme: "crowds",
      label: "Crowds",
      pattern: /crowd|busy|packed|quiet|people|attendee/i,
    },
    {
      theme: "group_experience",
      label: "Group experience",
      pattern:
        /group|friendly|organizer|welcome|together|social|meetup|team/i,
    },
  ];

/**
 * Extract theme hits only from real review text provided.
 * Does not invent reviews or claim an ML summarizer.
 */
export function summarizeReviewThemes(
  reviews: EventReview[],
): ReviewThemeSummary {
  if (!reviews.length) {
    return { themes: [], hasSourceReviews: false };
  }

  const hits = new Map<ReviewTheme, ReviewThemeHit>();

  for (const review of reviews) {
    const text = review.comment ?? "";
    if (!text.trim()) continue;
    for (const def of THEME_PATTERNS) {
      if (!def.pattern.test(text)) continue;
      const existing = hits.get(def.theme) ?? {
        theme: def.theme,
        label: def.label,
        reviewIds: [],
        excerpts: [],
      };
      if (!existing.reviewIds.includes(review.id)) {
        existing.reviewIds.push(review.id);
        existing.excerpts.push(
          text.length > 120 ? `${text.slice(0, 117)}…` : text,
        );
      }
      hits.set(def.theme, existing);
    }
  }

  return {
    themes: Array.from(hits.values()),
    hasSourceReviews: true,
  };
}
