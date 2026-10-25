import { describe, expect, it } from "vitest";
import {
  ingestClasspassViaApify,
  ingestEventbriteMeetupViaApify,
  ingestEventbriteOnlyViaApify,
  ingestFindEventsViaApify,
  ingestMeetupEventsViaApify,
  ingestRunsignupViaApify,
} from "@/lib/apify/ingest";
import type { ApifyClasspassRecord } from "@/types/apify-classpass";
import type { ApifyEventbriteMeetupRecord } from "@/types/apify-eventbrite-meetup";
import type { ApifyEventbriteOnlyRecord } from "@/types/apify-eventbrite-only";
import type { ApifyFindEventsRecord } from "@/types/apify-find-events";
import type { ApifyMeetupEventRecord } from "@/types/apify-meetup";
import type { ApifyRunsignupRecord } from "@/types/apify-runsignup";

function mockSupabase(options?: {
  existingId?: string | null;
  failUpdate?: boolean;
  failInsert?: boolean;
}) {
  const existingId = options?.existingId ?? null;

  function query() {
    const api: {
      eq: () => typeof api;
      ilike: () => typeof api;
      limit: () => typeof api;
      maybeSingle: () => Promise<{ data: { id: string } | null; error: null }>;
      then: (
        onFulfilled: (value: {
          data: Array<{ id: string; source_url: string }> | null;
          error: null;
        }) => unknown,
      ) => Promise<unknown>;
    } = {
      eq: () => api,
      ilike: () => api,
      limit: () => api,
      maybeSingle: async () => ({
        data: existingId ? { id: existingId } : null,
        error: null,
      }),
      // Awaited after .ilike().limit() for URL fallback lookup
      then: (onFulfilled) =>
        Promise.resolve(
          onFulfilled({
            data: null,
            error: null,
          }),
        ),
    };
    return api;
  }

  return {
    from() {
      return {
        select() {
          return query();
        },
        update() {
          return {
            eq: async () => ({
              error: options?.failUpdate
                ? { message: "update denied" }
                : null,
            }),
          };
        },
        insert: async () => ({
          error: options?.failInsert ? { message: "insert denied" } : null,
        }),
      };
    },
  };
}

const good: ApifyMeetupEventRecord = {
  id: "evt-1",
  title: "Bay Trail Ride",
  dateTime: "2026-11-02T10:00:00-07:00",
  endTime: "2026-11-02T12:00:00-07:00",
  description: "Cycling outdoors",
  url: "https://www.meetup.com/example/events/evt-1/",
  eventType: "PHYSICAL",
  isOnline: false,
  venue: { lat: 37.8, lon: -122.4 },
  query: "cycling",
};

describe("ingestMeetupEventsViaApify", () => {
  it("inserts new valid records and skips incomplete ones", async () => {
    const summary = await ingestMeetupEventsViaApify(
      { location: "San Francisco", query: "hiking" },
      {
        items: [
          good,
          { id: "bad", title: "No coords", dateTime: "2026-11-01T10:00:00Z" },
        ],
        runId: "run-test",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: mockSupabase() as any,
      },
    );

    expect(summary.fetched).toBe(2);
    expect(summary.imported).toBe(1);
    expect(summary.skipped).toBe(1);
    expect(summary.updated).toBe(0);
    expect(summary.failed).toBe(0);
  });

  it("updates existing source identity instead of duplicating", async () => {
    const summary = await ingestMeetupEventsViaApify(
      { location: "San Francisco", query: "hiking" },
      {
        items: [good],
        runId: "run-2",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: mockSupabase({ existingId: "uuid-existing" }) as any,
      },
    );
    expect(summary.imported).toBe(0);
    expect(summary.updated).toBe(1);
  });

  it("records Supabase write failures without silent mock fallback", async () => {
    const summary = await ingestMeetupEventsViaApify(
      { location: "San Francisco", query: "hiking" },
      {
        items: [good],
        runId: "run-3",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: mockSupabase({ failInsert: true }) as any,
      },
    );
    expect(summary.failed).toBe(1);
    expect(summary.failures[0]?.reason).toMatch(/insert failed/i);
  });
});

const recreationGood: ApifyEventbriteMeetupRecord = {
  source: "eventbrite",
  eventId: "eb-1",
  url: "https://www.eventbrite.com/e/volleyball-open-play-tickets-eb-1",
  title: "Volleyball Open Play",
  description: "Indoor volleyball",
  startAt: "2026-11-06T18:00:00-08:00",
  isOnline: false,
  isFree: true,
  venueName: "Community Gym",
  city: "Oakland",
  region: "CA",
  latitude: 37.8,
  longitude: -122.27,
  organizerName: "East Bay Volleyball",
  keyword: "volleyball",
  category: "Sports & Fitness",
};

describe("ingestEventbriteMeetupViaApify", () => {
  it("imports recreation Eventbrite rows and skips incomplete ones", async () => {
    const summary = await ingestEventbriteMeetupViaApify(
      { location: "San Francisco, CA" },
      {
        items: [
          recreationGood,
          {
            source: "meetup",
            eventId: "m-bad",
            title: "No coords",
            startAt: "2026-11-01T10:00:00Z",
            url: "https://www.meetup.com/x/events/m-bad/",
          },
        ],
        runId: "run-rec",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: mockSupabase() as any,
      },
    );
    expect(summary.actorId).toContain("eventbrite-meetup");
    expect(summary.fetched).toBe(2);
    expect(summary.imported).toBe(1);
    expect(summary.skipped).toBe(1);
  });
});

const findEventsGood: ApifyFindEventsRecord = {
  id: "luma:evt_1",
  platform: "luma",
  sourceUrl: "https://lu.ma/example-run",
  title: "Community 5K",
  category: "sports_fitness",
  startDateTimeUtc: "2026-11-10T16:00:00.000Z",
  latitude: 37.77,
  longitude: -122.42,
  isFree: true,
};

describe("ingestFindEventsViaApify", () => {
  it("imports Find Events rows with coordinates", async () => {
    const summary = await ingestFindEventsViaApify(
      { city: "San Francisco, CA", category: "sports_fitness" },
      {
        items: [
          findEventsGood,
          {
            id: "bad",
            platform: "dice",
            title: "No coords",
            startDateTimeUtc: "2026-11-01T10:00:00.000Z",
            sourceUrl: "https://dice.fm/event/x",
          },
        ],
        runId: "run-find",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: mockSupabase() as any,
      },
    );
    expect(summary.actorId).toContain("find-events");
    expect(summary.imported).toBe(1);
    expect(summary.skipped).toBe(1);
  });
});

const eventbriteOnlyGood: ApifyEventbriteOnlyRecord = {
  id: "ebo-1",
  title: "Indoor Volleyball Drop-in",
  url: "https://www.eventbrite.com/e/volleyball-tickets-ebo-1",
  startDate: "2026-11-15T19:00:00-08:00",
  latitude: 37.8,
  longitude: -122.27,
  category: "sports-and-fitness",
};

describe("ingestEventbriteOnlyViaApify", () => {
  it("imports Eventbrite-only rows", async () => {
    const summary = await ingestEventbriteOnlyViaApify(
      { location: "ca--san-francisco", category: "sports-and-fitness" },
      {
        items: [
          eventbriteOnlyGood,
          { id: "bad", title: "No coords", startDate: "2026-11-01T10:00:00Z" },
        ],
        runId: "run-ebo",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: mockSupabase() as any,
        enrichDescriptions: false,
      },
    );
    expect(summary.actorId).toContain("eventbrite-scraper");
    expect(summary.imported).toBe(1);
    expect(summary.skipped).toBe(1);
  });
});

const raceGood: ApifyRunsignupRecord = {
  raceId: 55,
  name: "Bay Bridge 5K",
  url: "https://runsignup.com/Race/CA/Oakland/BayBridge5K",
  nextDate: "2026-12-01T08:00:00.000-08:00",
  address: { city: "Oakland", state: "CA", countryCode: "US" },
  minCurrentPrice: 30,
};

describe("ingestRunsignupViaApify", () => {
  it("geocodes city when lat/lng missing then imports", async () => {
    const summary = await ingestRunsignupViaApify(
      { maxRaces: 10, states: ["CA"] },
      {
        items: [
          raceGood,
          {
            raceId: 56,
            name: "No city",
            url: "https://runsignup.com/Race/x",
            nextDate: "2026-12-02T08:00:00.000-08:00",
          },
        ],
        runId: "run-rs",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: mockSupabase() as any,
        enrichDescriptions: false,
        geocode: async () => ({ lat: 37.8, lng: -122.27 }),
      },
    );
    expect(summary.actorId).toContain("runsignup");
    expect(summary.imported).toBe(1);
    expect(summary.skipped).toBe(1);
  });
});

const studioGood: ApifyClasspassRecord = {
  venueId: 77,
  studioName: "Climb House",
  url: "https://classpass.com/studios/climb-house",
  activities: ["Climbing", "Yoga"],
  latitude: 37.77,
  longitude: -122.41,
};

describe("ingestClasspassViaApify", () => {
  it("imports studios into places", async () => {
    const summary = await ingestClasspassViaApify(
      { locations: ["San Francisco, CA"], maxResults: 10 },
      {
        items: [
          studioGood,
          { venueId: 78, studioName: "No GPS", url: "https://classpass.com/x" },
        ],
        runId: "run-cp",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: mockSupabase() as any,
      },
    );
    expect(summary.actorId).toContain("classpass");
    expect(summary.imported).toBe(1);
    expect(summary.skipped).toBe(1);
  });
});

describe("ingest auth boundary", () => {
  it("documents that live Apify calls require APIFY_API_TOKEN", async () => {
    const prev = process.env.APIFY_API_TOKEN;
    delete process.env.APIFY_API_TOKEN;
    await expect(
      ingestMeetupEventsViaApify({ location: "SF", query: "hike" }),
    ).rejects.toThrow(/APIFY_API_TOKEN/i);
    if (prev !== undefined) process.env.APIFY_API_TOKEN = prev;
  });
});
