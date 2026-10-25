/**
 * Server-only runner for seemuapps/eventbrite-meetup-events-scraper.
 */

import { ApifyClient } from "apify-client";
import { getApifyToken } from "@/lib/apify/run-meetup-actor";
import {
  APIFY_EVENTBRITE_MEETUP_ACTOR_ID,
  DEFAULT_RECREATION_KEYWORDS,
  type ApifyEventbriteMeetupActorInput,
  type ApifyEventbriteMeetupRecord,
} from "@/types/apify-eventbrite-meetup";

export type EventbriteMeetupRunResult = {
  runId: string;
  datasetId: string;
  items: ApifyEventbriteMeetupRecord[];
};

export async function runEventbriteMeetupActor(
  input: ApifyEventbriteMeetupActorInput,
): Promise<EventbriteMeetupRunResult> {
  const client = new ApifyClient({ token: getApifyToken() });

  const keywords =
    Array.isArray(input.keywords) && input.keywords.length > 0
      ? input.keywords.map((k) => k.trim()).filter(Boolean)
      : [...DEFAULT_RECREATION_KEYWORDS];

  const run = await client.actor(APIFY_EVENTBRITE_MEETUP_ACTOR_ID).call({
    location: input.location,
    keywords,
    dateRange: input.dateRange ?? "this-month",
    includeEventbrite: input.includeEventbrite ?? true,
    includeMeetup: input.includeMeetup ?? true,
    onlineOnly: input.onlineOnly ?? false,
    freeOnly: input.freeOnly ?? false,
    maxItemsPerSource:
      typeof input.maxItemsPerSource === "number"
        ? input.maxItemsPerSource
        : 50,
    fetchOrganizerDetails: input.fetchOrganizerDetails ?? false,
  });

  if (!run?.defaultDatasetId || !run.id) {
    throw new Error("Apify Actor run completed without a dataset id");
  }

  const { items } = await client.dataset(run.defaultDatasetId).listItems();

  return {
    runId: String(run.id),
    datasetId: String(run.defaultDatasetId),
    items: (items ?? []) as ApifyEventbriteMeetupRecord[],
  };
}
