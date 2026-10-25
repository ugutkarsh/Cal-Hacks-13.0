import { describe, expect, it } from "vitest";
import { normalizeClasspassRecord } from "@/lib/apify/normalize-classpass";
import type { ApifyClasspassRecord } from "@/types/apify-classpass";

const studio: ApifyClasspassRecord = {
  venueId: 4242,
  studioName: "Motion Lab",
  subtitle: "SOMA",
  url: "https://classpass.com/studios/motion-lab-soma",
  description: "Strength and HIIT",
  activities: ["HIIT", "Strength Training"],
  categories: ["Fitness"],
  address: "100 Folsom St, San Francisco, CA",
  latitude: 37.78,
  longitude: -122.39,
  imageUrl: "https://cdn.example.com/studio.jpg",
};

describe("normalizeClasspassRecord", () => {
  it("maps a studio to a place draft", () => {
    const result = normalizeClasspassRecord(studio);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.sourceProvider).toBe("classpass");
    expect(result.draft.name).toBe("Motion Lab — SOMA");
    expect(result.draft.category).toBe("sports");
    expect(result.draft.sourceRecordId).toBe("4242");
  });

  it("skips missing coords or name", () => {
    expect(
      normalizeClasspassRecord({ ...studio, latitude: null }).ok,
    ).toBe(false);
    expect(
      normalizeClasspassRecord({ ...studio, studioName: "" }).ok,
    ).toBe(false);
  });
});
