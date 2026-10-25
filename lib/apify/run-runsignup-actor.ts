/**
 * Server-only runner for hypebridge/runsignup-race-scraper.
 */

import { ApifyClient } from "apify-client";
import { getApifyToken } from "@/lib/apify/run-meetup-actor";
import {
  APIFY_RUNSIGNUP_ACTOR_ID,
  type ApifyRunsignupActorInput,
  type ApifyRunsignupRecord,
} from "@/types/apify-runsignup";

export type RunsignupRunResult = {
  runId: string;
  datasetId: string;
  items: ApifyRunsignupRecord[];
};

export async function runRunsignupActor(
  input: ApifyRunsignupActorInput,
): Promise<RunsignupRunResult> {
  const client = new ApifyClient({ token: getApifyToken() });

  const startUrls =
    Array.isArray(input.startUrls) && input.startUrls.length > 0
      ? input.startUrls
      : [{ url: "https://runsignup.com/Races?state=CA" }];

  const run = await client.actor(APIFY_RUNSIGNUP_ACTOR_ID).call({
    startUrls,
    maxRaces: typeof input.maxRaces === "number" ? input.maxRaces : 40,
    getSponsors: input.getSponsors === true,
    states: Array.isArray(input.states) ? input.states : ["CA"],
    country: input.country ?? "US",
    startDate: input.startDate,
    endDate: input.endDate,
    eventTypes: Array.isArray(input.eventTypes) ? input.eventTypes : undefined,
    zipcode: input.zipcode,
    radius: typeof input.radius === "number" ? input.radius : undefined,
    includeInfoSections: input.includeInfoSections !== false,
  });

  if (!run?.defaultDatasetId || !run.id) {
    throw new Error("Apify Actor run completed without a dataset id");
  }

  const { items } = await client.dataset(run.defaultDatasetId).listItems();

  return {
    runId: String(run.id),
    datasetId: String(run.defaultDatasetId),
    items: (items ?? []) as ApifyRunsignupRecord[],
  };
}
