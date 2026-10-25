/**
 * Integration-style tests for privacy + ranking composition
 * (no live Supabase — uses the same helpers the API route uses).
 */

import { describe, expect, it } from "vitest";
import {
  rankCompatibleTeammates,
  viewerFromOwnProfile,
} from "@/lib/community/compatibility";
import { profilesToPeopleCandidates } from "@/lib/community/recommend-for-post";
import { excludeBlockedIds } from "@/lib/privacy/blocks";
import type { PeopleMatchCandidate } from "@/lib/community/recommend-people";

describe("compatibility integration (catalog + blocks)", () => {
  it("maps public profile rows then ranks without inventing peers", () => {
    const rows = [
      {
        id: "peer-a",
        display_name: "Alex",
        bio: "Loves badminton",
        city: "San Francisco",
        neighborhood: "Mission",
        interests: ["badminton", "hiking"],
        skill_level: "beginner",
        availability_days: ["sat"],
        availability_start_hour: 17,
        availability_end_hour: 21,
        preferred_radius_km: 30,
        discovery_lat: 37.76,
        discovery_lng: -122.42,
        discoverable: true,
        location_share_level: "approximate",
      },
      {
        id: "peer-hidden",
        display_name: "Hidden",
        bio: null,
        city: "San Francisco",
        interests: ["badminton"],
        skill_level: "beginner",
        availability_days: ["sat"],
        availability_start_hour: 17,
        availability_end_hour: 21,
        preferred_radius_km: 30,
        discovery_lat: 37.76,
        discovery_lng: -122.42,
        discoverable: false,
        location_share_level: "approximate",
      },
    ];

    const candidates = profilesToPeopleCandidates(rows, new Map());
    expect(candidates.map((c) => c.id)).toEqual(["peer-a"]);

    const viewer = viewerFromOwnProfile({
      id: "me",
      interests: ["badminton"],
      skillLevel: "beginner",
      availabilityDays: ["sat"],
      availabilityStartHour: 16,
      availabilityEndHour: 22,
      city: "San Francisco",
      discoveryLat: 37.77,
      discoveryLng: -122.42,
      preferredRadiusKm: 40,
    });

    const ranked = rankCompatibleTeammates(viewer, candidates);
    expect(ranked.matches).toHaveLength(1);
    expect(ranked.matches[0].id).toBe("peer-a");
    expect(ranked.matches[0].reasons[0].label).toMatch(/badminton/i);
  });

  it("excludes blocked ids before ranking results are returned", () => {
    const candidates: PeopleMatchCandidate[] = [
      {
        id: "blocked",
        displayName: "Blocked",
        bio: null,
        city: "San Francisco",
        neighborhood: null,
        interests: ["badminton"],
        skillLevel: "beginner",
        availabilityDays: ["sat"],
        availabilityStartHour: 17,
        availabilityEndHour: 21,
        preferredRadiusKm: 35,
        discoveryLat: 37.76,
        discoveryLng: -122.42,
        discoverable: true,
        acceptsMessages: true,
        activelyLooking: false,
        activelyLookingNote: null,
        lookingActivity: null,
      },
      {
        id: "ok",
        displayName: "OK",
        bio: null,
        city: "San Francisco",
        neighborhood: null,
        interests: ["badminton"],
        skillLevel: "beginner",
        availabilityDays: ["sat"],
        availabilityStartHour: 17,
        availabilityEndHour: 21,
        preferredRadiusKm: 35,
        discoveryLat: 37.75,
        discoveryLng: -122.43,
        discoverable: true,
        acceptsMessages: true,
        activelyLooking: false,
        activelyLookingNote: null,
        lookingActivity: null,
      },
    ];

    const filtered = excludeBlockedIds(candidates, new Set(["blocked"]));
    const viewer = viewerFromOwnProfile({
      id: "me",
      interests: ["badminton"],
      skillLevel: "beginner",
      availabilityDays: ["sat"],
      availabilityStartHour: 17,
      availabilityEndHour: 21,
      city: "San Francisco",
      discoveryLat: 37.77,
      discoveryLng: -122.42,
      preferredRadiusKm: 40,
    });
    const ranked = rankCompatibleTeammates(viewer, filtered, {
      blockedIds: new Set(["blocked"]),
    });
    expect(ranked.matches.map((m) => m.id)).toEqual(["ok"]);
  });

  it("returns empty results honestly when catalog has no overlap", () => {
    const candidates = profilesToPeopleCandidates(
      [
        {
          id: "yoga-only",
          display_name: "Yogi",
          bio: null,
          city: "Oakland",
          interests: ["yoga"],
          skill_level: "advanced",
          availability_days: ["mon"],
          availability_start_hour: 6,
          availability_end_hour: 8,
          preferred_radius_km: 10,
          discovery_lat: 37.8,
          discovery_lng: -122.27,
          discoverable: true,
          location_share_level: "approximate",
        },
      ],
      new Map(),
    );
    const viewer = viewerFromOwnProfile({
      id: "me",
      interests: ["climbing"],
      skillLevel: "beginner",
      availabilityDays: ["sat"],
      availabilityStartHour: 17,
      availabilityEndHour: 21,
      city: "San Francisco",
      discoveryLat: 37.77,
      discoveryLng: -122.42,
      preferredRadiusKm: 15,
    });
    const ranked = rankCompatibleTeammates(viewer, candidates);
    expect(ranked.matches).toEqual([]);
    expect(ranked.emptyReason).toMatch(/No discoverable profiles/i);
  });
});
