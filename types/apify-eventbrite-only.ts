/**
 * Shape for Apify Actor crawlerbros/eventbrite-scraper (docs + Store examples).
 * Field names vary slightly; normalizer accepts common aliases.
 */

export const APIFY_EVENTBRITE_ONLY_ACTOR_ID = "crawlerbros/eventbrite-scraper";

/** Default Eventbrite location slug (SF Bay). */
export const DEFAULT_EVENTBRITE_ONLY_LOCATION = "ca--san-francisco";

/** Sports & fitness category slug used by Eventbrite browse URLs. */
export const DEFAULT_EVENTBRITE_ONLY_CATEGORY = "sports-and-fitness";

export type ApifyEventbriteOnlyActorInput = {
  /** Eventbrite location slug, e.g. `ca--san-francisco`. */
  location?: string;
  /** Category slug, e.g. `sports-and-fitness`. */
  category?: string;
  maxItems?: number;
  startUrls?: string[] | Array<{ url: string }>;
};

export type ApifyEventbriteOnlyRecord = {
  id?: string | number | null;
  eventId?: string | number | null;
  title?: string | null;
  name?: string | null;
  description?: string | null;
  url?: string | null;
  ticketUrl?: string | null;
  startDate?: string | null;
  start?: string | null;
  startsAt?: string | null;
  endDate?: string | null;
  end?: string | null;
  endsAt?: string | null;
  venue?: string | null;
  venueName?: string | null;
  address?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  lat?: number | null;
  lng?: number | null;
  lon?: number | null;
  imageUrl?: string | null;
  image?: string | null;
  category?: string | null;
  tags?: string[] | null;
  organizer?: string | null;
  organizerName?: string | null;
  isOnline?: boolean | null;
  minPrice?: number | null;
  price?: number | null;
  isFree?: boolean | null;
};
