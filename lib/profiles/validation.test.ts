import { describe, expect, it } from "vitest";
import {
  assertDiscoverableCoords,
  fuzzDiscoveryCoordinate,
  parseProfileUpdate,
} from "@/lib/profiles/validation";
import { mapOwnProfile, mapPublicProfile } from "@/lib/profiles/mappers";
import type { DbProfile } from "@/types/database";

function baseRow(overrides: Partial<DbProfile> = {}): DbProfile {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    display_name: "Alex",
    avatar_url: null,
    bio: "Hikes on weekends",
    city: "Oakland",
    neighborhood: "Rockridge",
    discoverable: true,
    discovery_lat: 37.841234,
    discovery_lng: -122.251987,
    interests: ["hiking", "running"],
    skill_level: "intermediate",
    availability_days: ["sat", "sun"],
    availability_start_hour: 9,
    availability_end_hour: 17,
    preferred_radius_km: 15,
    dm_policy: "discoverable_only",
    created_at: "2026-10-24T00:00:00.000Z",
    updated_at: "2026-10-24T00:00:00.000Z",
    ...overrides,
  };
}

describe("parseProfileUpdate", () => {
  it("accepts a valid patch and ignores forged identity fields", () => {
    const parsed = parseProfileUpdate({
      displayName: "Sam",
      city: "Berkeley",
      id: "22222222-2222-2222-2222-222222222222",
      userId: "forged",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.displayName).toBe("Sam");
    expect(parsed.value.city).toBe("Berkeley");
    expect(
      Object.prototype.hasOwnProperty.call(parsed.value, "id"),
    ).toBe(false);
    expect(
      Object.prototype.hasOwnProperty.call(parsed.value, "userId"),
    ).toBe(false);
  });

  it("rejects empty display names", () => {
    const parsed = parseProfileUpdate({ displayName: "   " });
    expect(parsed.ok).toBe(false);
  });

  it("fuzzes discovery coordinates on write", () => {
    const parsed = parseProfileUpdate({
      discoveryLat: 37.841234,
      discoveryLng: -122.251987,
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.discoveryLat).toBe(37.84);
    expect(parsed.value.discoveryLng).toBe(-122.25);
  });

  it("rejects non-https avatar URLs", () => {
    const parsed = parseProfileUpdate({
      avatarUrl: "http://insecure.example/a.png",
    });
    expect(parsed.ok).toBe(false);
  });
});

describe("assertDiscoverableCoords", () => {
  it("requires a pin when discoverable", () => {
    expect(
      assertDiscoverableCoords({
        discoverable: true,
        discoveryLat: null,
        discoveryLng: null,
      }),
    ).toMatch(/city pin/i);
  });

  it("allows private profiles without a pin", () => {
    expect(
      assertDiscoverableCoords({
        discoverable: false,
        discoveryLat: null,
        discoveryLng: null,
      }),
    ).toBeNull();
  });
});

describe("public vs own projection", () => {
  it("public projection fuzzes coords and omits dm_policy enum", () => {
    const pub = mapPublicProfile(baseRow());
    expect(pub).not.toBeNull();
    expect(pub!.discoveryLat).toBe(fuzzDiscoveryCoordinate(37.841234));
    expect(pub!.discoveryLng).toBe(fuzzDiscoveryCoordinate(-122.251987));
    expect(pub!.acceptsMessages).toBe(true);
    expect(pub).not.toHaveProperty("dmPolicy");
    expect(pub!.presenceNote).toMatch(/not a live location/i);
  });

  it("hides non-discoverable profiles from the public mapper", () => {
    expect(mapPublicProfile(baseRow({ discoverable: false }))).toBeNull();
  });

  it("own projection keeps messaging policy for the owner", () => {
    const own = mapOwnProfile(baseRow({ dm_policy: "nobody" }));
    expect(own.dmPolicy).toBe("nobody");
    expect(own.discoveryLat).toBe(37.841234);
  });
});
