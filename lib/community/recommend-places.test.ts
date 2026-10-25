import { describe, expect, it } from "vitest";
import {
  recommendVenuesForPost,
  scorePlaceForPost,
} from "@/lib/community/recommend-places";
import type { PostMatchQuery } from "@/lib/community/post-to-preferences";
import type { PlaceEntity } from "@/types/map-entities";

function query(partial: Partial<PostMatchQuery> = {}): PostMatchQuery {
  return {
    activity: "badminton",
    category: "sports",
    city: "San Francisco",
    neighborhood: null,
    preferredDays: ["sat"],
    timeStartHour: 17,
    timeEndHour: 21,
    skillLevel: null,
    budgetCents: null,
    radiusKm: 20,
    intent: "find_venue",
    searchCenter: { lat: 37.77, lng: -122.42 },
    interestText: "badminton",
    ...partial,
  };
}

function place(partial: Partial<PlaceEntity> & { id: string }): PlaceEntity {
  return {
    kind: "place",
    name: "City Badminton Club",
    category: "sports",
    summary: "Indoor badminton courts",
    locationLabel: "San Francisco",
    coordinates: { lat: 37.78, lng: -122.43 },
    imageUrl: null,
    imageCredit: null,
    provenance: "supabase",
    createdAt: "2026-10-24T00:00:00.000Z",
    amenities: [],
    rating: null,
    reviewCount: 0,
    ...partial,
  };
}

describe("recommendVenuesForPost", () => {
  it("ranks real venues by activity text and does not claim bookable", () => {
    const scored = scorePlaceForPost(place({ id: "p1" }), query());
    expect(scored).not.toBeNull();
    expect(scored!.kind).toBe("venue");
    expect(scored!.availabilityNote).toMatch(/not verified/i);
    expect(scored!.reasons.some((r) => r.code === "text_relevance")).toBe(true);
  });

  it("excludes out-of-radius venues when center exists", () => {
    const far = place({
      id: "p2",
      name: "LA Gym",
      summary: "badminton",
      coordinates: { lat: 34.05, lng: -118.24 },
    });
    expect(scorePlaceForPost(far, query({ radiusKm: 10 }))).toBeNull();
  });

  it("returns empty for unrelated catalog rows (no invention)", () => {
    const result = recommendVenuesForPost(
      [
        place({
          id: "p3",
          name: "Quiet Library",
          summary: "Books and study rooms",
          category: "other",
        }),
        place({
          id: "p3b",
          name: "F45 Training",
          summary: "HIIT gym",
          category: "sports",
        }),
      ],
      query(),
    );
    expect(result.items).toEqual([]);
    expect(result.emptyReason).toMatch(/badminton/i);
  });

  it("suggests pickleball court as a labeled similar alternative", () => {
    const scored = scorePlaceForPost(
      place({
        id: "p5",
        name: "Mission Pickleball Courts",
        summary: "Outdoor pickleball courts",
        category: "sports",
      }),
      query(),
    );
    expect(scored).not.toBeNull();
    expect(scored!.reasons.some((r) => r.code === "similar_activity")).toBe(
      true,
    );
    expect(JSON.stringify(scored!.reasons)).toMatch(/pickleball/i);
  });

  it("keeps same-city venues when the post city is set but not geocoded", () => {
    const scored = scorePlaceForPost(
      place({ id: "p4", locationLabel: "San Francisco" }),
      query({ searchCenter: null, city: "San Francisco", radiusKm: null }),
    );
    expect(scored).not.toBeNull();
    expect(scored!.reasons.some((r) => r.code === "same_city")).toBe(true);
  });
});
