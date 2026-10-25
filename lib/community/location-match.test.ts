import { describe, expect, it } from "vitest";
import { isNearPostLocality, textMentionsCity } from "@/lib/community/location-match";

describe("isNearPostLocality", () => {
  const sf = { lat: 37.77, lng: -122.42 };

  it("keeps SF pins and drops Boston when center is SF", () => {
    const local = isNearPostLocality({
      coordinates: { lat: 37.78, lng: -122.43 },
      locationText: "Jefferson Park Badminton",
      city: "San Francisco",
      searchCenter: sf,
      radiusKm: 35,
    });
    expect(local.ok).toBe(true);

    const far = isNearPostLocality({
      coordinates: { lat: 42.36, lng: -71.06 },
      locationText: "Boston Badminton Westboro (MA)",
      city: "San Francisco",
      searchCenter: sf,
      radiusKm: 35,
    });
    expect(far.ok).toBe(false);
  });

  it("accepts same-city label when coords are missing", () => {
    const check = isNearPostLocality({
      coordinates: null,
      locationText: "Indoor club in San Francisco",
      city: "San Francisco, CA",
      searchCenter: null,
      radiusKm: null,
    });
    expect(check.ok).toBe(true);
    expect(check.sameCityLabel).toBe(true);
  });

  it("matches city needles", () => {
    expect(textMentionsCity("Oakland badminton gym", "Oakland")).toBe(true);
    expect(textMentionsCity("Boston club", "San Francisco")).toBe(false);
  });
});
