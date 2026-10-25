import { describe, expect, it } from "vitest";
import { normalizeEventbriteMeetupRecord } from "@/lib/apify/normalize-eventbrite-meetup";
import type { ApifyEventbriteMeetupRecord } from "@/types/apify-eventbrite-meetup";

const valid: ApifyEventbriteMeetupRecord = {
  source: "eventbrite",
  eventId: "1999181441508",
  url: "https://www.eventbrite.com/e/badminton-open-play-tickets-1999181441508",
  title: "Badminton Open Play Night",
  description: "Indoor badminton for all levels",
  startAt: "2026-11-05T19:00:00-08:00",
  endAt: "2026-11-05T21:00:00-08:00",
  isOnline: false,
  isFree: false,
  minPrice: 12.5,
  maxPrice: 20,
  currency: "USD",
  venueName: "City Gym",
  address: "100 Court St",
  city: "San Francisco",
  region: "CA",
  latitude: 37.78,
  longitude: -122.42,
  category: "Sports & Fitness",
  tags: ["Badminton", "Open Gym"],
  organizerName: "SF Racket Club",
  keyword: "badminton",
};

describe("normalizeEventbriteMeetupRecord", () => {
  it("maps a complete Eventbrite sports record with price and host", () => {
    const result = normalizeEventbriteMeetupRecord(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.sourceProvider).toBe("eventbrite");
    expect(result.draft.sourceRecordId).toBe("1999181441508");
    expect(result.draft.category).toBe("sports");
    expect(result.draft.costCents).toBe(1250);
    expect(result.draft.hostLabel).toBe("SF Racket Club");
    expect(result.draft.locationLabel).toContain("City Gym");
  });

  it("maps Meetup rows with free flag to costCents 0", () => {
    const result = normalizeEventbriteMeetupRecord({
      ...valid,
      source: "meetup",
      eventId: "316099065",
      url: "https://www.meetup.com/example/events/316099065/",
      isFree: true,
      minPrice: null,
      keyword: "volleyball",
      title: "Volleyball pickup",
      description: "Casual pickup — free for everyone",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.sourceProvider).toBe("meetup");
    expect(result.draft.costCents).toBe(0);
    expect(result.draft.category).toBe("sports");
  });

  it("overrides false Free when description states Fee: $18", () => {
    const result = normalizeEventbriteMeetupRecord({
      ...valid,
      source: "meetup",
      eventId: "m-fee-18",
      url: "https://www.meetup.com/example/events/m-fee-18/",
      isFree: true,
      minPrice: null,
      title: "BBC Doubles Badminton",
      description:
        "Doubles badminton for intermediate and above. Fee: $18 per person, paid directly to the Club at entry (non BBC Club members).",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.costCents).toBe(1800);
  });

  it("rejects missing coordinates and online events", () => {
    expect(
      normalizeEventbriteMeetupRecord({
        ...valid,
        latitude: null,
        longitude: null,
      }).ok,
    ).toBe(false);
    expect(
      normalizeEventbriteMeetupRecord({ ...valid, isOnline: true }).ok,
    ).toBe(false);
  });
});
