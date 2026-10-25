import { NextResponse } from "next/server";
import {
  ingestClasspassViaApify,
  ingestEventbriteMeetupViaApify,
  ingestFindEventsViaApify,
  ingestRunsignupViaApify,
  type IngestSummary,
} from "@/lib/apify/ingest";
import {
  autoIngestMinIntervalMs,
  formatRetryAfter,
  isAutoIngestEnabled,
  markAutoIngestStarted,
  shouldSkipAutoIngest,
} from "@/lib/ingest/auto-refresh-gate";
import { resolvePlaceLabelForIngest } from "@/lib/location/nominatim-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type ActorKey =
  | "eventbrite_meetup"
  | "find_events"
  | "runsignup"
  | "classpass";

const STATE_NAME_TO_CODE: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
};

function guessUsStates(place: string): string[] {
  const lower = place.toLowerCase();
  for (const [name, code] of Object.entries(STATE_NAME_TO_CODE)) {
    if (lower.includes(name)) return [code];
  }
  const m = place.match(/\b([A-Z]{2})\b/);
  if (m && Object.values(STATE_NAME_TO_CODE).includes(m[1]!)) {
    return [m[1]!];
  }
  return [];
}

function guessRunsignupSearchUrl(place: string): string {
  const states = guessUsStates(place);
  if (states[0]) {
    return `https://runsignup.com/Races?state=${states[0]}`;
  }
  return "https://runsignup.com/Races";
}

function emptyActorSummary(): Pick<
  IngestSummary,
  "imported" | "updated" | "skipped" | "failed" | "descriptionsEnriched" | "fetched"
> {
  return {
    imported: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    descriptionsEnriched: 0,
    fetched: 0,
  };
}

function pickSummary(
  settled: PromiseSettledResult<IngestSummary>,
): ReturnType<typeof emptyActorSummary> & { error?: string } {
  if (settled.status === "fulfilled") {
    const s = settled.value;
    return {
      imported: s.imported,
      updated: s.updated,
      skipped: s.skipped,
      failed: s.failed,
      descriptionsEnriched: s.descriptionsEnriched,
      fetched: s.fetched,
    };
  }
  return {
    ...emptyActorSummary(),
    error:
      settled.reason instanceof Error
        ? settled.reason.message
        : "Actor failed",
  };
}

/**
 * Browser-callable nearby refresh for the user's chosen place.
 * Runs all available recreation Actors in parallel (no curl needed).
 * Eventbrite-only (crawlerbros) is skipped — token often lacks rental access.
 */
export async function POST(request: Request) {
  if (!isAutoIngestEnabled()) {
    return NextResponse.json(
      {
        ok: false,
        skipped: true,
        reason:
          "Auto-ingest is off. Set AUTO_INGEST_ON_OPEN=true in .env.local (server) to refresh on app open.",
      },
      { status: 501 },
    );
  }

  if (
    !process.env.APIFY_API_TOKEN?.trim() ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  ) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "APIFY_API_TOKEN and SUPABASE_SERVICE_ROLE_KEY are required for auto-ingest",
      },
      { status: 503 },
    );
  }

  let body: {
    lat?: unknown;
    lng?: unknown;
    locationLabel?: unknown;
    force?: unknown;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const lat = typeof body.lat === "number" ? body.lat : Number(body.lat);
  const lng = typeof body.lng === "number" ? body.lng : Number(body.lng);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return NextResponse.json(
      { ok: false, error: "Valid lat/lng required" },
      { status: 400 },
    );
  }

  const force = body.force === true;
  const minInterval = autoIngestMinIntervalMs();
  const gate = shouldSkipAutoIngest(lat, lng, minInterval);
  if (gate.skip && !force) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: `Nearby data still fresh for this area (retry in ~${formatRetryAfter(gate.retryAfterMs ?? 0)})`,
      bucket: gate.bucket,
    });
  }

  markAutoIngestStarted(gate.bucket);

  const locationLabel =
    typeof body.locationLabel === "string" ? body.locationLabel : null;

  try {
    const place = await resolvePlaceLabelForIngest({
      lat,
      lng,
      locationLabel,
    });

    const settled = await Promise.allSettled([
      ingestEventbriteMeetupViaApify(
        {
          location: place,
          dateRange: "this-month",
          includeEventbrite: true,
          includeMeetup: true,
          onlineOnly: false,
          maxItemsPerSource: 30,
          fetchOrganizerDetails: false,
        },
        { enrichDescriptions: true },
      ),
      ingestFindEventsViaApify(
        {
          city: place,
          category: "sports_fitness",
          timeWindow: "this_month",
          maxEvents: 30,
          getEventDetails: true,
        },
        { enrichDescriptions: true },
      ),
      ingestRunsignupViaApify(
        {
          startUrls: [
            {
              url: guessRunsignupSearchUrl(place),
            },
          ],
          maxRaces: 20,
          getSponsors: false,
          states: guessUsStates(place),
          country: "US",
          includeInfoSections: true,
        },
        { enrichDescriptions: true },
      ),
      ingestClasspassViaApify({
        locations: [place],
        maxResults: 20,
        includeDetails: true,
        includeSchedule: false,
      }),
    ]);

    const keys: ActorKey[] = [
      "eventbrite_meetup",
      "find_events",
      "runsignup",
      "classpass",
    ];
    const actors: Record<string, ReturnType<typeof pickSummary>> = {};
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    let descriptionsEnriched = 0;
    let fetched = 0;

    keys.forEach((key, i) => {
      const part = pickSummary(settled[i]!);
      actors[key] = part;
      imported += part.imported;
      updated += part.updated;
      skipped += part.skipped;
      failed += part.failed;
      descriptionsEnriched += part.descriptionsEnriched;
      fetched += part.fetched;
    });

    return NextResponse.json({
      ok: true,
      skipped: false,
      location: place,
      bucket: gate.bucket,
      note: "Auto multi-Actor refresh for this place (Eventbrite+Meetup, Find Events, RunSignup, ClassPass). Descriptions enriched from public pages.",
      summary: {
        imported,
        updated,
        skipped,
        failed,
        descriptionsEnriched,
        fetched,
      },
      actors,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Auto-ingest failed unexpectedly";
    return NextResponse.json(
      {
        ok: false,
        error: message,
        note: "Failed refresh does not fall back to mock data.",
      },
      { status: 500 },
    );
  }
}
