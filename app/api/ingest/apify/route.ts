import { NextResponse } from "next/server";
import {
  ingestClasspassViaApify,
  ingestEventbriteMeetupViaApify,
  ingestEventbriteOnlyViaApify,
  ingestFindEventsViaApify,
  ingestMeetupEventsViaApify,
  ingestRunsignupViaApify,
} from "@/lib/apify/ingest";
import type { ApifyClasspassActorInput } from "@/types/apify-classpass";
import type { ApifyEventbriteMeetupActorInput } from "@/types/apify-eventbrite-meetup";
import { DEFAULT_RECREATION_KEYWORDS } from "@/types/apify-eventbrite-meetup";
import {
  DEFAULT_EVENTBRITE_ONLY_CATEGORY,
  DEFAULT_EVENTBRITE_ONLY_LOCATION,
  type ApifyEventbriteOnlyActorInput,
} from "@/types/apify-eventbrite-only";
import type { ApifyFindEventsActorInput } from "@/types/apify-find-events";
import { DEFAULT_FIND_EVENTS_PLATFORMS } from "@/types/apify-find-events";
import type { ApifyMeetupActorInput } from "@/types/apify-meetup";
import type { ApifyRunsignupActorInput } from "@/types/apify-runsignup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Allow longer Apify sync runs in hosted environments that honor this. */
export const maxDuration = 300;

type IngestActor =
  | "meetup"
  | "eventbrite_meetup"
  | "find_events"
  | "eventbrite"
  | "runsignup"
  | "classpass";

function authorize(request: Request): boolean {
  const expected = process.env.INGEST_SECRET?.trim();
  if (
    !expected ||
    expected.startsWith("your-") ||
    expected.includes("$(openssl")
  ) {
    return false;
  }
  const header = request.headers.get("authorization");
  const bearer = header?.startsWith("Bearer ")
    ? header.slice("Bearer ".length).trim()
    : null;
  const alt = request.headers.get("x-ingest-secret")?.trim();
  return bearer === expected || alt === expected;
}

function resolveActor(raw: string): IngestActor {
  if (
    raw === "eventbrite_meetup" ||
    raw === "recreation" ||
    raw === "seemuapps"
  ) {
    return "eventbrite_meetup";
  }
  if (
    raw === "find_events" ||
    raw === "find-events" ||
    raw === "hypebridge" ||
    raw === "multi"
  ) {
    return "find_events";
  }
  if (
    raw === "eventbrite" ||
    raw === "eventbrite_only" ||
    raw === "crawlerbros"
  ) {
    return "eventbrite";
  }
  if (
    raw === "runsignup" ||
    raw === "run_signup" ||
    raw === "races"
  ) {
    return "runsignup";
  }
  if (raw === "classpass" || raw === "studios") {
    return "classpass";
  }
  return "meetup";
}

export async function POST(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json(
      {
        error:
          "Unauthorized. Set INGEST_SECRET and send Authorization: Bearer <secret>.",
      },
      { status: 401 },
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const actorRaw =
    typeof body.actor === "string" ? body.actor.trim().toLowerCase() : "meetup";
  const actor = resolveActor(actorRaw);

  try {
    if (actor === "eventbrite_meetup") {
      const location =
        typeof body.location === "string" && body.location.trim()
          ? body.location.trim()
          : "San Francisco, CA";
      const keywords = Array.isArray(body.keywords)
        ? body.keywords.filter((k): k is string => typeof k === "string")
        : [...DEFAULT_RECREATION_KEYWORDS];

      const input: ApifyEventbriteMeetupActorInput = {
        location,
        keywords,
        dateRange:
          typeof body.dateRange === "string"
            ? (body.dateRange as ApifyEventbriteMeetupActorInput["dateRange"])
            : "this-month",
        includeEventbrite: body.includeEventbrite !== false,
        includeMeetup: body.includeMeetup !== false,
        onlineOnly: body.onlineOnly === true,
        freeOnly: body.freeOnly === true,
        maxItemsPerSource:
          typeof body.maxItemsPerSource === "number"
            ? body.maxItemsPerSource
            : 40,
        fetchOrganizerDetails: body.fetchOrganizerDetails === true,
      };

      const summary = await ingestEventbriteMeetupViaApify(input);
      return NextResponse.json({ ok: true, actor, summary });
    }

    if (actor === "find_events") {
      const city =
        typeof body.city === "string" && body.city.trim()
          ? body.city.trim()
          : typeof body.location === "string" && body.location.trim()
            ? body.location.trim()
            : "San Francisco, CA";

      const platforms = Array.isArray(body.platforms)
        ? body.platforms.filter((p): p is string => typeof p === "string")
        : [...DEFAULT_FIND_EVENTS_PLATFORMS];

      const input: ApifyFindEventsActorInput = {
        city,
        category:
          typeof body.category === "string"
            ? (body.category as ApifyFindEventsActorInput["category"])
            : "sports_fitness",
        timeWindow:
          typeof body.timeWindow === "string"
            ? (body.timeWindow as ApifyFindEventsActorInput["timeWindow"])
            : "this_month",
        maxEvents: typeof body.maxEvents === "number" ? body.maxEvents : 40,
        platforms,
        getEventDetails: body.getEventDetails !== false,
      };

      const summary = await ingestFindEventsViaApify(input);
      return NextResponse.json({ ok: true, actor, summary });
    }

    if (actor === "eventbrite") {
      const input: ApifyEventbriteOnlyActorInput = {
        location:
          typeof body.location === "string" && body.location.trim()
            ? body.location.trim()
            : DEFAULT_EVENTBRITE_ONLY_LOCATION,
        category:
          typeof body.category === "string" && body.category.trim()
            ? body.category.trim()
            : DEFAULT_EVENTBRITE_ONLY_CATEGORY,
        maxItems: typeof body.maxItems === "number" ? body.maxItems : 40,
      };
      if (Array.isArray(body.startUrls)) {
        input.startUrls = body.startUrls.filter(
          (u): u is string => typeof u === "string",
        );
      }

      const summary = await ingestEventbriteOnlyViaApify(input);
      return NextResponse.json({ ok: true, actor, summary });
    }

    if (actor === "runsignup") {
      const states = Array.isArray(body.states)
        ? body.states.filter((s): s is string => typeof s === "string")
        : ["CA"];

      const input: ApifyRunsignupActorInput = {
        maxRaces: typeof body.maxRaces === "number" ? body.maxRaces : 40,
        getSponsors: body.getSponsors === true,
        states,
        country: typeof body.country === "string" ? body.country : "US",
        startDate:
          typeof body.startDate === "string" ? body.startDate : undefined,
        endDate: typeof body.endDate === "string" ? body.endDate : undefined,
        zipcode: typeof body.zipcode === "string" ? body.zipcode : undefined,
        radius: typeof body.radius === "number" ? body.radius : undefined,
        includeInfoSections: body.includeInfoSections !== false,
      };

      if (Array.isArray(body.startUrls)) {
        input.startUrls = body.startUrls
          .map((u) => {
            if (typeof u === "string") return { url: u };
            if (u && typeof u === "object" && "url" in u) {
              const url = (u as { url?: unknown }).url;
              return typeof url === "string" ? { url } : null;
            }
            return null;
          })
          .filter((u): u is { url: string } => u != null);
      }

      const summary = await ingestRunsignupViaApify(input);
      return NextResponse.json({ ok: true, actor, summary });
    }

    if (actor === "classpass") {
      const locations = Array.isArray(body.locations)
        ? body.locations.filter((l): l is string => typeof l === "string")
        : typeof body.location === "string" && body.location.trim()
          ? [body.location.trim()]
          : ["San Francisco, CA"];

      const input: ApifyClasspassActorInput = {
        locations,
        activities: Array.isArray(body.activities)
          ? body.activities.filter((a): a is string => typeof a === "string")
          : undefined,
        category: typeof body.category === "string" ? body.category : undefined,
        maxResults: typeof body.maxResults === "number" ? body.maxResults : 30,
        includeDetails: body.includeDetails !== false,
        includeSchedule: body.includeSchedule === true,
        radiusKm: typeof body.radiusKm === "number" ? body.radiusKm : undefined,
      };

      const summary = await ingestClasspassViaApify(input);
      return NextResponse.json({ ok: true, actor, summary });
    }

    const meetupBody = body as Partial<ApifyMeetupActorInput>;
    const location =
      typeof meetupBody.location === "string" && meetupBody.location.trim()
        ? meetupBody.location.trim()
        : "San Francisco";
    const query =
      typeof meetupBody.query === "string" && meetupBody.query.trim()
        ? meetupBody.query.trim()
        : "hiking";

    const summary = await ingestMeetupEventsViaApify({
      location,
      query,
      radius: typeof meetupBody.radius === "number" ? meetupBody.radius : 25,
      days: typeof meetupBody.days === "number" ? meetupBody.days : 14,
      maxResults:
        typeof meetupBody.maxResults === "number" ? meetupBody.maxResults : 20,
      eventType: meetupBody.eventType ?? "PHYSICAL",
      topicCategoryId: meetupBody.topicCategoryId ?? "684",
      minRsvpCount:
        typeof meetupBody.minRsvpCount === "number"
          ? meetupBody.minRsvpCount
          : undefined,
    });

    return NextResponse.json({ ok: true, actor, summary });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Ingestion failed unexpectedly";
    return NextResponse.json(
      {
        ok: false,
        error: message,
        note: "Failed Apify/Supabase ingest does not fall back to mock data.",
      },
      { status: 500 },
    );
  }
}
