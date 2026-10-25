import { describe, expect, it } from "vitest";
import {
  eventToMlPayload,
  preferencesToMlPayload,
} from "@/lib/recommendations/ml-client";
import { createDefaultPreferences } from "@/lib/preferences/defaults";
import type { EventEntity } from "@/types/map-entities";

function sampleEvent(): EventEntity {
  return {
    id: "act-1",
    kind: "event",
    name: "Bay Trail Ride",
    category: "cycling",
    summary: "Group cycling outdoors",
    locationLabel: "Embarcadero",
    coordinates: { lat: 37.8, lng: -122.4 },
    imageUrl: null,
    imageCredit: null,
    provenance: "apify",
    createdAt: "2026-01-01T00:00:00.000Z",
    startsAt: "2026-11-02T17:00:00.000Z",
    endsAt: "2026-11-02T19:00:00.000Z",
    organizerName: "Group",
    organizerId: "org-1",
    sourceUrl: "https://www.meetup.com/example/events/1/",
    capacity: 20,
    attendeeCount: 0,
    attendeesPreview: [],
    reviews: [],
    isRegistrationOpen: true,
    difficultyLabel: "Beginner",
    costCents: 0,
  };
}

describe("ml-client payloads", () => {
  it("maps events without inventing fields", () => {
    const payload = eventToMlPayload(sampleEvent());
    expect(payload.id).toBe("act-1");
    expect(payload.title).toBe("Bay Trail Ride");
    expect(payload.category).toBe("cycling");
    expect(payload.cost_cents).toBe(0);
    expect(payload.latitude).toBe(37.8);
  });

  it("maps preferences to snake_case for FastAPI", () => {
    const prefs = createDefaultPreferences();
    const payload = preferencesToMlPayload(prefs);
    expect(payload.preferred_categories).toEqual(prefs.preferredCategories);
    expect(payload.max_distance_km).toBe(prefs.maxDistanceKm);
    expect(payload.time_window.start_hour).toBe(prefs.timeWindow.startHour);
    expect(payload.starting_point?.lat).toBe(prefs.startingPoint?.lat);
  });
});
