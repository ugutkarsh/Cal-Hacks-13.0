import { describe, expect, it } from "vitest";
import { normalizeEventbriteOnlyRecord } from "@/lib/apify/normalize-eventbrite-only";
import type { ApifyEventbriteOnlyRecord } from "@/types/apify-eventbrite-only";

const good: ApifyEventbriteOnlyRecord = {
  id: "eb-only-1",
  title: "SF Pickleball Open Play",
  description: "Bring a paddle",
  url: "https://www.eventbrite.com/e/pickleball-tickets-eb-only-1",
  startDate: "2026-11-12T18:00:00-08:00",
  endDate: "2026-11-12T20:00:00-08:00",
  venueName: "Mission Rec Center",
  city: "San Francisco",
  latitude: 37.76,
  longitude: -122.42,
  category: "sports-and-fitness",
  organizerName: "Bay Area Pickleball",
  isFree: false,
  minPrice: 12,
};

describe("normalizeEventbriteOnlyRecord", () => {
  it("maps a complete Eventbrite-only row", () => {
    const result = normalizeEventbriteOnlyRecord(good);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.sourceProvider).toBe("eventbrite");
    expect(result.draft.sourceRecordId).toBe("eb-only-1");
    expect(result.draft.category).toBe("sports");
    expect(result.draft.costCents).toBe(1200);
    expect(result.draft.hostLabel).toBe("Bay Area Pickleball");
  });

  it("skips online and missing coords", () => {
    expect(
      normalizeEventbriteOnlyRecord({
        ...good,
        isOnline: true,
      }).ok,
    ).toBe(false);
    expect(
      normalizeEventbriteOnlyRecord({
        ...good,
        latitude: null,
        longitude: null,
      }).ok,
    ).toBe(false);
  });
});
