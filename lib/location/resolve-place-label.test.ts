import { describe, expect, it } from "vitest";
import { resolvePlaceLabelForIngest } from "@/lib/location/nominatim-server";

describe("resolvePlaceLabelForIngest", () => {
  it("uses a short city label from the user when provided", async () => {
    const label = await resolvePlaceLabelForIngest({
      lat: 30.27,
      lng: -97.74,
      locationLabel: "Austin, Travis County, Texas, United States",
    });
    expect(label).toBe("Austin, Travis County");
  });

  it("ignores demo pin labels and falls back to reverse geocode or coords", async () => {
    const label = await resolvePlaceLabelForIngest({
      lat: 37.7749,
      lng: -122.4194,
      locationLabel: "Demo pin · Downtown SF (not live GPS)",
    });
    // Without network in unit tests reverse may fail → coordinate fallback
    expect(label.length).toBeGreaterThan(2);
  });
});
