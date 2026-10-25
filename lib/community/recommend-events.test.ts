import { describe, expect, it } from "vitest";
import { recommendEventsForPost } from "@/lib/community/recommend-events";
import type { PostMatchQuery } from "@/lib/community/post-to-preferences";
import type { EventEntity } from "@/types/map-entities";

function query(partial: Partial<PostMatchQuery> = {}): PostMatchQuery {
  return {
    activity: "badminton",
    category: "sports",
    city: "San Francisco",
    neighborhood: null,
    preferredDays: ["sat"],
    timeStartHour: 17,
    timeEndHour: 21,
    skillLevel: "any",
    budgetCents: null,
    radiusKm: 50,
    intent: "find_teammates",
    searchCenter: { lat: 37.77, lng: -122.42 },
    interestText: "badminton",
    ...partial,
  };
}

function event(partial: Partial<EventEntity> & { id: string }): EventEntity {
  return {
    kind: "event",
    name: "Saturday Badminton Meetup",
    category: "sports",
    summary: "Casual badminton for all levels",
    locationLabel: "SF Rec Center",
    coordinates: { lat: 37.76, lng: -122.43 },
    imageUrl: null,
    imageCredit: null,
    provenance: "apify",
    createdAt: "2026-10-24T00:00:00.000Z",
    startsAt: "2026-10-24T18:00:00.000Z", // Saturday 18:00 UTC
    endsAt: "2026-10-24T20:00:00.000Z",
    organizerName: "Club",
    organizerId: "org",
    sourceUrl: "https://example.com/events/badminton-1",
    capacity: 20,
    attendeeCount: 4,
    attendeesPreview: [],
    reviews: [],
    isRegistrationOpen: true,
    difficultyLabel: "Open to all",
    costCents: null,
    ...partial,
  };
}

describe("recommendEventsForPost", () => {
  it("returns real events with source URL and labeled method", async () => {
    const result = await recommendEventsForPost(
      [
        event({ id: "e1" }),
        event({
          id: "e1-dup",
          sourceUrl: "https://example.com/events/badminton-1",
          summary: "dup",
        }),
        event({
          id: "e2",
          name: "Poetry Night",
          category: "meetup",
          summary: "Open mic",
          sourceUrl: "https://example.com/poetry",
        }),
      ],
      query(),
    );
    expect(result.method).toMatch(/deterministic|tfidf|rules/);
    expect(result.methodNote.length).toBeGreaterThan(10);
    // Deduped by URL — at most one badminton listing with that URL
    const badminton = result.items.filter((i) =>
      /badminton/i.test(i.name + i.summary),
    );
    expect(badminton.length).toBeGreaterThanOrEqual(1);
    expect(badminton[0].sourceUrl).toContain("example.com");
    expect(badminton[0].kind).toBe("event");
    expect(badminton[0].availabilityNote).toMatch(/not a guarantee/i);
  });

  it("returns empty when catalog has no relevant rows", async () => {
    const result = await recommendEventsForPost(
      [
        event({
          id: "e3",
          name: "Chess Club",
          category: "meetup",
          summary: "Board games",
          sourceUrl: null,
        }),
        event({
          id: "e4",
          name: "Bachata Night",
          category: "sports",
          summary: "Dance class",
          sourceUrl: "https://example.com/bachata",
        }),
      ],
      query(),
    );
    expect(result.items).toEqual([]);
    expect(result.emptyReason).toMatch(/badminton/i);
  });

  it("labels pickleball as a similar alternative when badminton is missing", async () => {
    const result = await recommendEventsForPost(
      [
        event({
          id: "e5",
          name: "Tuesday Pickleball Social",
          category: "sports",
          summary: "Bring a paddle",
          sourceUrl: "https://example.com/pickle",
        }),
      ],
      query(),
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0].reasons.some((r) => r.code === "similar_activity")).toBe(
      true,
    );
  });

  it("hides far-away same-activity events outside the post city radius", async () => {
    const result = await recommendEventsForPost(
      [
        event({
          id: "e-sf",
          name: "SF Badminton Meetup",
          summary: "Badminton in the city",
          coordinates: { lat: 37.76, lng: -122.43 },
          locationLabel: "San Francisco",
          sourceUrl: "https://example.com/sf-badminton",
        }),
        event({
          id: "e-bos",
          name: "Boston Badminton Westboro (MA)",
          summary: "Badminton",
          coordinates: { lat: 42.36, lng: -71.06 },
          locationLabel: "Westboro, MA",
          sourceUrl: "https://example.com/bos-badminton",
        }),
      ],
      query(),
    );
    expect(result.items.map((i) => i.id)).toEqual(["e-sf"]);
  });
});
