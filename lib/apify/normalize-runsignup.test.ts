import { describe, expect, it } from "vitest";
import {
  normalizeRunsignupRecord,
  runsignupGeocodeQuery,
} from "@/lib/apify/normalize-runsignup";
import type { ApifyRunsignupRecord } from "@/types/apify-runsignup";

const race: ApifyRunsignupRecord = {
  raceId: 991122,
  name: "Golden Gate 10K",
  url: "https://runsignup.com/Race/CA/SanFrancisco/GoldenGate10K",
  nextDate: "2026-11-22T08:00:00.000-08:00",
  address: { city: "San Francisco", state: "CA", countryCode: "US" },
  minCurrentPrice: 45,
  events: [{ name: "10K", distance: "6.2 Miles", currentPrice: 45 }],
};

describe("normalizeRunsignupRecord", () => {
  it("builds a geocode query from city/state", () => {
    expect(runsignupGeocodeQuery(race)).toBe("San Francisco, CA, US");
  });

  it("accepts fallback city coordinates", () => {
    const result = normalizeRunsignupRecord(race, {
      coords: { lat: 37.77, lng: -122.42 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.sourceProvider).toBe("runsignup");
    expect(result.draft.category).toBe("running");
    expect(result.draft.costCents).toBe(4500);
    expect(result.draft.latitude).toBe(37.77);
  });

  it("fails without coordinates", () => {
    const result = normalizeRunsignupRecord(race, { coords: null });
    expect(result.ok).toBe(false);
  });
});
