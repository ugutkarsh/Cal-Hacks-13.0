/**
 * Server-only runner for scrapersdelight/classpass-studios-scraper.
 */

import { ApifyClient } from "apify-client";
import { getApifyToken } from "@/lib/apify/run-meetup-actor";
import {
  APIFY_CLASSPASS_ACTOR_ID,
  type ApifyClasspassActorInput,
  type ApifyClasspassRecord,
} from "@/types/apify-classpass";

export type ClasspassRunResult = {
  runId: string;
  datasetId: string;
  items: ApifyClasspassRecord[];
};

export async function runClasspassActor(
  input: ApifyClasspassActorInput,
): Promise<ClasspassRunResult> {
  const client = new ApifyClient({ token: getApifyToken() });

  const locations =
    Array.isArray(input.locations) && input.locations.length > 0
      ? input.locations
      : ["San Francisco, CA"];

  const run = await client.actor(APIFY_CLASSPASS_ACTOR_ID).call({
    locations,
    activities: Array.isArray(input.activities) ? input.activities : undefined,
    category: input.category,
    maxResults: typeof input.maxResults === "number" ? input.maxResults : 30,
    includeDetails: input.includeDetails !== false,
    includeSchedule: input.includeSchedule === true,
    radiusKm: typeof input.radiusKm === "number" ? input.radiusKm : undefined,
  });

  if (!run?.defaultDatasetId || !run.id) {
    throw new Error("Apify Actor run completed without a dataset id");
  }

  const { items } = await client.dataset(run.defaultDatasetId).listItems();

  return {
    runId: String(run.id),
    datasetId: String(run.defaultDatasetId),
    items: (items ?? []) as ApifyClasspassRecord[],
  };
}
