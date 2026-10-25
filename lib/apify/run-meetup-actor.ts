/**
 * Server-only Apify Actor runner for Meetup Events Scraper.
 */

import { ApifyClient } from "apify-client";
import {
  APIFY_MEETUP_ACTOR_ID,
  type ApifyMeetupActorInput,
  type ApifyMeetupEventRecord,
} from "@/types/apify-meetup";

export type ApifyRunResult = {
  runId: string;
  datasetId: string;
  items: ApifyMeetupEventRecord[];
};

export function getApifyToken(): string {
  const token = process.env.APIFY_API_TOKEN?.trim();
  if (!token || token.startsWith("your-")) {
    throw new Error("APIFY_API_TOKEN is not configured (server-only)");
  }
  return token;
}

export async function runMeetupEventsActor(
  input: ApifyMeetupActorInput,
): Promise<ApifyRunResult> {
  const client = new ApifyClient({ token: getApifyToken() });

  const run = await client.actor(APIFY_MEETUP_ACTOR_ID).call({
    location: input.location,
    query: input.query,
    radius: input.radius ?? 25,
    days: input.days ?? 14,
    maxResults: input.maxResults ?? 30,
    eventType: input.eventType ?? "PHYSICAL",
    topicCategoryId: input.topicCategoryId ?? "684", // Travel & Outdoor
    minRsvpCount: input.minRsvpCount,
    startDate: input.startDate ?? "",
    endDate: input.endDate ?? "",
  });

  if (!run?.defaultDatasetId || !run.id) {
    throw new Error("Apify Actor run completed without a dataset id");
  }

  const { items } = await client.dataset(run.defaultDatasetId).listItems();

  return {
    runId: String(run.id),
    datasetId: String(run.defaultDatasetId),
    items: (items ?? []) as ApifyMeetupEventRecord[],
  };
}
