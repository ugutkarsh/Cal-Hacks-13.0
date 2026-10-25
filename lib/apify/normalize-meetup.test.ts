import { describe, expect, it } from "vitest";
import { normalizeMeetupRecord } from "@/lib/apify/normalize-meetup";
import type { ApifyMeetupEventRecord } from "@/types/apify-meetup";

const valid: ApifyMeetupEventRecord = {
  id: "315237783",
  title: "Sunrise Trail Hike",
  dateTime: "2026-11-01T09:00:00-07:00",
  endTime: "2026-11-01T12:00:00-07:00",
  description: "Group hike outdoors",
  url: "https://www.meetup.com/example/events/315237783/",
  imageUrl: "https://example.com/photo.jpg",
  eventType: "PHYSICAL",
  isOnline: false,
  venue: {
    name: "Park",
    address: "1 Trail Rd",
    city: "San Francisco",
    state: "CA",
    lat: 37.77,
    lon: -122.42,
  },
  group: { name: "SF Outdoor Club", urlname: "sf-outdoor-club" },
  fee: null,
  topics: [{ name: "Hiking" }],
  query: "hiking",
};

describe("normalizeMeetupRecord", () => {
  it("maps a complete physical Meetup record", () => {
    const result = normalizeMeetupRecord(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.sourceRecordId).toBe("315237783");
    expect(result.draft.sourceProvider).toBe("meetup");
    expect(result.draft.sourceType).toBe("apify");
    expect(result.draft.category).toBe("hiking");
    expect(result.draft.latitude).toBe(37.77);
    expect(result.draft.sourceUrl).toContain("meetup.com");
    expect(result.draft.locationLabel).toBe("Park · San Francisco, CA");
    expect(result.draft.hostLabel).toBe("SF Outdoor Club");
  });

  it("leaves host/venue labels null when source omits them", () => {
    const result = normalizeMeetupRecord({
      ...valid,
      venue: { lat: 37.77, lon: -122.42 },
      group: null,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.locationLabel).toBeNull();
    expect(result.draft.hostLabel).toBeNull();
  });

  it("rejects missing coordinates instead of inventing them", () => {
    const result = normalizeMeetupRecord({
      ...valid,
      venue: { name: "TBD", lat: null, lon: null },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/coordinates/i);
  });

  it("rejects online events", () => {
    const result = normalizeMeetupRecord({
      ...valid,
      isOnline: true,
      eventType: "ONLINE",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects invalid dates and missing URLs", () => {
    expect(
      normalizeMeetupRecord({ ...valid, dateTime: "not-a-date" }).ok,
    ).toBe(false);
    expect(normalizeMeetupRecord({ ...valid, url: "ftp://bad" }).ok).toBe(
      false,
    );
  });
});
