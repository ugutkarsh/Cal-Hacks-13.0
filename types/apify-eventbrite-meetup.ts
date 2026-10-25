/**
 * Shape documented by Apify Actor seemuapps/eventbrite-meetup-events-scraper.
 * Fields may be missing; normalizer must not invent values.
 */

export const APIFY_EVENTBRITE_MEETUP_ACTOR_ID =
  "seemuapps/eventbrite-meetup-events-scraper";

/** Default sports / recreation keyword pack for Bay Area demos. */
export const DEFAULT_RECREATION_KEYWORDS = [
  "badminton",
  "volleyball",
  "pickleball",
  "basketball open gym",
  "pickup soccer",
  "tennis",
  "table tennis",
  "indoor soccer",
  "open gym",
  "yoga",
] as const;

export type ApifyEventbriteMeetupActorInput = {
  location: string;
  keywords?: string[];
  dateRange?:
    | "today"
    | "tomorrow"
    | "this-week"
    | "this-weekend"
    | "next-week"
    | "this-month"
    | "all";
  includeEventbrite?: boolean;
  includeMeetup?: boolean;
  onlineOnly?: boolean;
  freeOnly?: boolean;
  maxItemsPerSource?: number;
  fetchOrganizerDetails?: boolean;
};

export type ApifyEventbriteMeetupRecord = {
  source?: "eventbrite" | "meetup" | string | null;
  eventId?: string | number | null;
  url?: string | null;
  title?: string | null;
  description?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  timezone?: string | null;
  isOnline?: boolean | null;
  isFree?: boolean | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  currency?: string | null;
  venueName?: string | null;
  address?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  attendeeCount?: number | null;
  capacity?: number | null;
  category?: string | null;
  tags?: string[] | null;
  imageUrl?: string | null;
  organizerName?: string | null;
  organizerUrl?: string | null;
  organizerId?: string | null;
  keyword?: string | null;
  scrapedAt?: string | null;
};
