/**
 * Shape documented by Apify Actor epicscrapers/meetup-events-scraper.
 * Fields may be missing; normalizer must not invent values.
 */

export const APIFY_MEETUP_ACTOR_ID = "epicscrapers/meetup-events-scraper";

export type ApifyMeetupActorInput = {
  location: string;
  query: string;
  radius?: number;
  days?: number;
  maxResults?: number;
  eventType?: "PHYSICAL" | "ONLINE" | "HYBRID" | "";
  topicCategoryId?: string;
  minRsvpCount?: number;
  startDate?: string;
  endDate?: string;
};

export type ApifyMeetupVenue = {
  name?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  lat?: number | null;
  lon?: number | null;
};

export type ApifyMeetupGroup = {
  name?: string | null;
  urlname?: string | null;
};

export type ApifyMeetupEventRecord = {
  id?: string | number | null;
  title?: string | null;
  dateTime?: string | null;
  endTime?: string | null;
  description?: string | null;
  url?: string | null;
  imageUrl?: string | null;
  displayImageUrl?: string | null;
  eventType?: string | null;
  isOnline?: boolean | null;
  status?: string | null;
  venue?: ApifyMeetupVenue | null;
  /** Hosting Meetup group when present on the Actor output. */
  group?: ApifyMeetupGroup | null;
  fee?: { amount?: number | null; currency?: string | null } | null;
  topics?: Array<{ name?: string | null }> | null;
  query?: string | null;
};
