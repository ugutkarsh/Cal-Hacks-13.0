/**
 * Shape documented by Apify Actor scrapersdelight/classpass-studios-scraper.
 */

export const APIFY_CLASSPASS_ACTOR_ID =
  "scrapersdelight/classpass-studios-scraper";

export type ApifyClasspassActorInput = {
  locations?: string[];
  activities?: string[];
  category?: string;
  maxResults?: number;
  includeDetails?: boolean;
  includeSchedule?: boolean;
  radiusKm?: number;
};

export type ApifyClasspassRecord = {
  venueId?: string | number | null;
  alias?: string | null;
  studioName?: string | null;
  subtitle?: string | null;
  url?: string | null;
  description?: string | null;
  activities?: string[] | null;
  categories?: string[] | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  imageUrl?: string | null;
  mainImage?: string | null;
  rating?: number | null;
  amenities?: string[] | null;
};
