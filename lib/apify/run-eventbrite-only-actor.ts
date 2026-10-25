/**
 * Server-only runner for crawlerbros/eventbrite-scraper.
 */

import { ApifyClient } from "apify-client";
import { getApifyToken } from "@/lib/apify/run-meetup-actor";
import {
  APIFY_EVENTBRITE_ONLY_ACTOR_ID,
  type ApifyEventbriteOnlyActorInput,
  type ApifyEventbriteOnlyRecord,
} from "@/types/apify-eventbrite-only";

export type EventbriteOnlyRunResult = {
  runId: string;
  datasetId: string;
  items: ApifyEventbriteOnlyRecord[];
};

export async function runEventbriteOnlyActor(
  input: ApifyEventbriteOnlyActorInput,
): Promise<EventbriteOnlyRunResult> {
  const client = new ApifyClient({ token: getApifyToken() });

  const payload: Record<string, unknown> = {
    maxItems: typeof input.maxItems === "number" ? input.maxItems : 40,
  };

  if (Array.isArray(input.startUrls) && input.startUrls.length > 0) {
    payload.startUrls = input.startUrls.map((u) =>
      typeof u === "string" ? u : u.url,
    );
  } else {
    payload.location = input.location?.trim() || "ca--san-francisco";
    payload.category = input.category?.trim() || "sports-and-fitness";
  }

  const run = await client.actor(APIFY_EVENTBRITE_ONLY_ACTOR_ID).call(payload);

  if (!run?.defaultDatasetId || !run.id) {
    throw new Error("Apify Actor run completed without a dataset id");
  }

  const { items } = await client.dataset(run.defaultDatasetId).listItems();

  return {
    runId: String(run.id),
    datasetId: String(run.defaultDatasetId),
    items: (items ?? []) as ApifyEventbriteOnlyRecord[],
  };
}
