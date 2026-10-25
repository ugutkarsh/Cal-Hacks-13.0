import { describe, expect, it } from "vitest";
import {
  filterVisibleMapEntities,
  relevanceTierFromScores,
  sortEntitiesForMarkerStack,
} from "@/lib/map/discovery-visibility";
import type { EventEntity, PlaceEntity } from "@/types/map-entities";

function eventEntity(
  partial: Partial<EventEntity> & Pick<EventEntity, "id">,
): EventEntity {
  return {
    kind: "event",
    name: partial.id,
    category: "hiking",
    summary: "",
    locationLabel: "SF",
    coordinates: { lat: 37.77, lng: -122.42 },
    imageUrl: null,
    imageCredit: null,
    provenance: "mock",
    createdAt: "2026-01-01T00:00:00.000Z",
    startsAt: "2026-10-25T16:00:00.000Z",
    endsAt: "2026-10-25T18:00:00.000Z",
    organizerName: "Org",
    organizerId: "o",
    sourceUrl: null,
    capacity: 10,
    attendeeCount: 1,
    attendeesPreview: [],
    reviews: [],
    isRegistrationOpen: true,
    difficultyLabel: "Any",
    costCents: 0,
    ...partial,
  };
}

function placeEntity(
  partial: Partial<PlaceEntity> & Pick<PlaceEntity, "id">,
): PlaceEntity {
  return {
    kind: "place",
    name: partial.id,
    category: "hiking",
    summary: "",
    locationLabel: "SF",
    coordinates: { lat: 37.77, lng: -122.42 },
    imageUrl: null,
    imageCredit: null,
    provenance: "mock",
    createdAt: "2026-01-01T00:00:00.000Z",
    amenities: [],
    rating: null,
    reviewCount: 0,
    ...partial,
  };
}

describe("filterVisibleMapEntities — filter authority", () => {
  const center = { lat: 37.7749, lng: -122.4194 };
  const near = eventEntity({
    id: "near",
    coordinates: { lat: 37.78, lng: -122.42 },
  });
  const far = eventEntity({
    id: "far",
    coordinates: { lat: 38.5, lng: -122.5 },
  });

  it("clips by soft distance when there is no search/NL", () => {
    const visible = filterVisibleMapEntities({
      entities: [near, far],
      startingPoint: center,
      maxDistanceKm: 5,
      searchActive: false,
      nlMatchIds: null,
      forYouOnly: false,
      recommendedIds: new Set(),
    });
    expect(visible.map((e) => e.id)).toEqual(["near"]);
  });

  it("does not silently drop far search hits when search is active", () => {
    const visible = filterVisibleMapEntities({
      entities: [near, far],
      startingPoint: center,
      maxDistanceKm: 5,
      searchActive: true,
      nlMatchIds: null,
      forYouOnly: false,
      recommendedIds: new Set(),
    });
    expect(visible.map((e) => e.id).sort()).toEqual(["far", "near"]);
  });

  it("keeps NL match ids even when outside prefs distance", () => {
    const visible = filterVisibleMapEntities({
      entities: [near, far],
      startingPoint: center,
      maxDistanceKm: 5,
      searchActive: false,
      nlMatchIds: new Set(["far"]),
      forYouOnly: false,
      recommendedIds: new Set(),
    });
    expect(visible.map((e) => e.id)).toEqual(["far"]);
  });

  it("For You only filters events, keeps places", () => {
    const place = placeEntity({ id: "p1" });
    const visible = filterVisibleMapEntities({
      entities: [near, far, place],
      startingPoint: null,
      maxDistanceKm: 25,
      searchActive: false,
      nlMatchIds: null,
      forYouOnly: true,
      recommendedIds: new Set(["near"]),
    });
    expect(visible.map((e) => e.id).sort()).toEqual(["near", "p1"]);
  });

  it("drops entities with missing coordinates (never invents pins)", () => {
    const bad = eventEntity({
      id: "bad",
      coordinates: { lat: NaN, lng: -122 },
    });
    const visible = filterVisibleMapEntities({
      entities: [near, bad],
      startingPoint: null,
      maxDistanceKm: 25,
      searchActive: true,
      nlMatchIds: null,
      forYouOnly: false,
      recommendedIds: new Set(),
    });
    expect(visible.map((e) => e.id)).toEqual(["near"]);
  });
});

describe("relevance tiers + stack order", () => {
  it("assigns high/medium only when personalization enabled", () => {
    const tiers = relevanceTierFromScores(
      [
        { activityId: "a", score: 60 },
        { activityId: "b", score: 50 },
        { activityId: "c", score: 45 },
        { activityId: "d", score: 10 },
      ],
      true,
    );
    expect(tiers.get("a")).toBe("high");
    expect(tiers.get("d")).toBe("medium");
    expect(
      relevanceTierFromScores([{ activityId: "a", score: 60 }], false).size,
    ).toBe(0);
  });

  it("stacks selected above recommended when overlapping", () => {
    const a = eventEntity({ id: "a" });
    const b = eventEntity({ id: "b" });
    const sorted = sortEntitiesForMarkerStack([a, b], {
      selectedId: "b",
      emphasizedId: null,
      relevanceById: new Map([["a", "high"]]),
    });
    expect(sorted.map((e) => e.id)).toEqual(["a", "b"]);
  });
});
