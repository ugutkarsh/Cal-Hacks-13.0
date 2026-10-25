/**
 * Server-only runner for hypebridge/find-events.
 */

import { ApifyClient } from "apify-client";
import { getApifyToken } from "@/lib/apify/run-meetup-actor";
import {
  APIFY_FIND_EVENTS_ACTOR_ID,
  DEFAULT_FIND_EVENTS_PLATFORMS,
  type ApifyFindEventsActorInput,
  type ApifyFindEventsRecord,
} from "@/types/apify-find-events";

export type FindEventsRunResult = {
  runId: string;
  datasetId: string;
  items: ApifyFindEventsRecord[];
};

export async function runFindEventsActor(
  input: ApifyFindEventsActorInput,
): Promise<FindEventsRunResult> {
  const client = new ApifyClient({ token: getApifyToken() });

  const platforms =
    Array.isArray(input.platforms) && input.platforms.length > 0
      ? input.platforms
      : [...DEFAULT_FIND_EVENTS_PLATFORMS];

  const run = await client.actor(APIFY_FIND_EVENTS_ACTOR_ID).call({
    city: input.city,
    category: input.category ?? "sports_fitness",
    timeWindow: input.timeWindow ?? "this_month",
    maxEvents: typeof input.maxEvents === "number" ? input.maxEvents : 40,
    platforms,
    getEventDetails: input.getEventDetails ?? true,
    childRunTimeoutSecs:
      typeof input.childRunTimeoutSecs === "number"
        ? input.childRunTimeoutSecs
        : 240,
    debugMode: false,
  });

  if (!run?.defaultDatasetId || !run.id) {
    throw new Error("Apify Actor run completed without a dataset id");
  }

  const { items } = await client.dataset(run.defaultDatasetId).listItems();

  return {
    runId: String(run.id),
    datasetId: String(run.defaultDatasetId),
    items: (items ?? []) as ApifyFindEventsRecord[],
  };
}
