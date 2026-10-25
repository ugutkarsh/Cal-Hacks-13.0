import { describe, expect, it } from "vitest";
import { dedupeMapEntities } from "@/lib/data/dedupe-entities";
import type { EventEntity } from "@/types/map-entities";

function event(partial: Partial<EventEntity> & Pick<EventEntity, "id" | "name">): EventEntity {
  return {
    kind: "event",
    category: "sports",
    summary: "",
    locationLabel: "X",
    coordinates: { lat: 37.8, lng: -122.2 },
    imageUrl: null,
    imageCredit: null,
    provenance: "apify",
    createdAt: "2026-10-24T00:00:00.000Z",
    startsAt: "2026-10-31T20:00:00.000Z",
    endsAt: "2026-10-31T22:00:00.000Z",
    organizerName: "Org",
    organizerId: "o",
    sourceUrl: "https://www.eventbrite.com/e/foo-tickets-2003096286916",
    capacity: 10,
    attendeeCount: 0,
    attendeesPreview: [],
    reviews: [],
    isRegistrationOpen: true,
    difficultyLabel: "Open",
    costCents: null,
    ...partial,
  };
}

describe("dedupeMapEntities", () => {
  it("keeps one event per canonical source URL", () => {
    const out = dedupeMapEntities([
      event({
        id: "a",
        name: "Buti",
        summary: "short",
        sourceUrl:
          "https://www.eventbrite.com/e/foo-tickets-2003096286916/?utm=1",
      }),
      event({
        id: "b",
        name: "Buti",
        summary: "much longer description that should win",
        sourceUrl:
          "https://www.eventbrite.com/e/foo-tickets-2003096286916",
      }),
    ]);
    const events = out.filter((e) => e.kind === "event");
    expect(events).toHaveLength(1);
    expect(events[0]?.id).toBe("b");
  });
});
