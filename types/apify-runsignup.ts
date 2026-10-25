/**
 * Shape documented by Apify Actor hypebridge/runsignup-race-scraper.
 */

export const APIFY_RUNSIGNUP_ACTOR_ID = "hypebridge/runsignup-race-scraper";

export type ApifyRunsignupActorInput = {
  startUrls?: Array<{ url: string }>;
  maxRaces?: number;
  getSponsors?: boolean;
  states?: string[];
  country?: string;
  startDate?: string;
  endDate?: string;
  eventTypes?: string[];
  zipcode?: string;
  radius?: number;
  includeInfoSections?: boolean;
};

export type ApifyRunsignupAddress = {
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  countryCode?: string | null;
};

export type ApifyRunsignupRecord = {
  raceId?: string | number | null;
  name?: string | null;
  url?: string | null;
  nextDate?: string | null;
  address?: ApifyRunsignupAddress | null;
  minCurrentPrice?: number | null;
  maxCurrentPrice?: number | null;
  description?: string | null;
  infoSections?: Record<string, string> | null;
  events?: Array<{
    name?: string | null;
    distance?: string | null;
    currentPrice?: number | null;
  }> | null;
  latitude?: number | null;
  longitude?: number | null;
};
