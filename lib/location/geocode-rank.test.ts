import { describe, expect, it } from "vitest";
import {
  queryRequestsNonUs,
  rankGeocodeCandidates,
  scoreGeocodeCandidate,
} from "@/lib/location/geocode-rank";

describe("geocode ranking", () => {
  it("prefers US California over Ecuador for ambiguous names", () => {
    const ranked = rankGeocodeCandidates(
      [
        {
          label: "Manta, Manabí, Ecuador",
          lat: -1.03,
          lng: -80.81,
          countryCode: "ec",
          importance: 0.6,
        },
        {
          label: "Manta, California, United States",
          lat: 36.1,
          lng: -120.1,
          countryCode: "us",
          importance: 0.3,
        },
      ],
      "Manta",
    );
    expect(ranked[0].countryCode).toBe("us");
    expect(ranked[0].label).toMatch(/United States|California/i);
  });

  it("penalizes Ecuador labels", () => {
    expect(
      scoreGeocodeCandidate(
        {
          label: "Guayaquil, Guayas, Ecuador",
          lat: -2.1,
          lng: -79.8,
          countryCode: "ec",
        },
        "Guayaquil",
      ),
    ).toBeLessThan(
      scoreGeocodeCandidate(
        {
          label: "Oakland, California, United States",
          lat: 37.8,
          lng: -122.2,
          countryCode: "us",
        },
        "Oakland",
      ),
    );
  });

  it("detects explicit non-US queries", () => {
    expect(queryRequestsNonUs("Quito, Ecuador")).toBe(true);
    expect(queryRequestsNonUs("Oakland, CA")).toBe(false);
  });
});
