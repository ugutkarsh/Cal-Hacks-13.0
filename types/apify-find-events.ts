/**
 * Shape documented by Apify Actor hypebridge/find-events.
 * Fields may be missing; normalizer must not invent values.
 */

export const APIFY_FIND_EVENTS_ACTOR_ID = "hypebridge/find-events";

/** Default recreation-focused Find Events search. */
export const DEFAULT_FIND_EVENTS_PLATFORMS = [
  "meetup",
  "eventbrite",
  "runsignup",
  "luma",
] as const;

export type ApifyFindEventsCategory =
  | "music"
  | "nightlife"
  | "technology"
  | "business"
  | "food_drink"
  | "arts_culture"
  | "comedy"
  | "sports_fitness"
  | "wellness"
  | "community_culture"
  | "family_education"
  | "all";

export type ApifyFindEventsActorInput = {
  city: string;
  category?: ApifyFindEventsCategory;
  timeWindow?: "this_week" | "this_month" | "all";
  maxEvents?: number;
  platforms?: string[];
  getEventDetails?: boolean;
  childRunTimeoutSecs?: number;
};

export type ApifyFindEventsRecord = {
  id?: string | number | null;
  platform?: string | null;
  sourceUrl?: string | null;
  category?: string | null;
  title?: string | null;
  description?: string | null;
  startDateTimeUtc?: string | null;
  endDateTimeUtc?: string | null;
  localDate?: string | null;
  venueName?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  lat?: number | null;
  lon?: number | null;
  lng?: number | null;
  priceMin?: number | null;
  priceMax?: number | null;
  isFree?: boolean | null;
  currency?: string | null;
  imageUrl?: string | null;
  scrapedAt?: string | null;
  sourceFields?: Record<string, unknown> | null;
};
