import { describe, expect, it } from "vitest";
import { normalizeFindEventsRecord } from "@/lib/apify/normalize-find-events";
import type { ApifyFindEventsRecord } from "@/types/apify-find-events";

const valid: ApifyFindEventsRecord = {
  id: "meetup:316099065",
  platform: "meetup",
  sourceUrl: "https://www.meetup.com/example/events/316099065/",
  category: "sports_fitness",
  title: "Pickup Volleyball",
  description: "Indoor volleyball open play",
  startDateTimeUtc: "2026-11-08T02:00:00.000Z",
  venueName: "City Gym",
  city: "San Francisco",
  state: "CA",
  latitude: 37.78,
  longitude: -122.42,
  isFree: true,
  priceMin: 0,
};

describe("normalizeFindEventsRecord", () => {
  it("maps a complete Find Events sports record", () => {
    const result = normalizeFindEventsRecord(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.sourceProvider).toBe("meetup");
    // Canonical id strips provider: prefix (stable across Actors).
    expect(result.draft.sourceRecordId).toBe("316099065");
    expect(result.draft.category).toBe("sports");
    expect(result.draft.costCents).toBe(0);
    expect(result.draft.locationLabel).toContain("City Gym");
  });

  it("reads coords from sourceFields.venue when top-level missing", () => {
    const result = normalizeFindEventsRecord({
      ...valid,
      latitude: null,
      longitude: null,
      sourceFields: { venue: { lat: 37.8, lon: -122.27 } },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.latitude).toBe(37.8);
  });

  it("rejects missing coordinates", () => {
    expect(
      normalizeFindEventsRecord({
        ...valid,
        latitude: null,
        longitude: null,
        sourceFields: null,
      }).ok,
    ).toBe(false);
  });
});
