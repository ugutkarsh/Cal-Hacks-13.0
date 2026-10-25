export type ReviewTheme =
  | "difficulty"
  | "cost"
  | "crowds"
  | "group_experience";

export interface ReviewThemeHit {
  theme: ReviewTheme;
  label: string;
  /** Source review ids that contributed. */
  reviewIds: string[];
  excerpts: string[];
}

export interface ReviewThemeSummary {
  themes: ReviewThemeHit[];
  /** False when no review text was available. */
  hasSourceReviews: boolean;
}
