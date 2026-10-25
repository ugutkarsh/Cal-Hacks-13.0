import { describe, expect, it } from "vitest";
import {
  mapActivityRow,
  mapDiscoverableProfile,
  mapPlaceRow,
  toActivityCategory,
} from "@/lib/data/mappers";
import type { DbActivityWithRelations, DbPlace, DbProfile } from "@/types/database";

describe("toActivityCategory", () => {
  it("maps known categories and falls back to other", () => {
    expect(toActivityCategory("hiking")).toBe("hiking");
    expect(toActivityCategory("nope")).toBe("other");
  });
});

describe("mapPlaceRow", () => {
  it("maps a valid place", () => {
    const row: DbPlace = {
      id: "p1",
      name: "Trail Head",
      description: "A path",
      category: "hiking",
      latitude: 37.7,
      longitude: -122.4,
      image_url: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };
    const entity = mapPlaceRow(row);
    expect(entity?.kind).toBe("place");
    expect(entity?.provenance).toBe("supabase");
    expect(entity?.coordinates).toEqual({ lat: 37.7, lng: -122.4 });
  });

  it("rejects malformed places", () => {
    expect(
      mapPlaceRow({
        id: "p1",
        name: "",
        description: "",
        category: "hiking",
        latitude: 37.7,
        longitude: -122.4,
        image_url: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      }),
    ).toBeNull();
  });
});

describe("mapActivityRow", () => {
  it("uses place coordinates and registration counts without inventing attendees", () => {
    const row: DbActivityWithRelations = {
      id: "a1",
      title: "Morning Run",
      description: "Easy pace",
      category: "running",
      place_id: "p1",
      organizer_id: "u1",
      starts_at: "2026-11-01T16:00:00.000Z",
      ends_at: null,
      capacity: 10,
      image_url: null,
      source_type: "community",
      source_url: null,
      source_provider: null,
      source_record_id: null,
      imported_at: null,
      last_verified_at: null,
      import_run_id: null,
      latitude: null,
      longitude: null,
      difficulty_label: "Beginner-friendly",
      location_label: null,
      host_label: null,
      cost_cents: 500,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      places: {
        name: "Embarcadero",
        latitude: 37.79,
        longitude: -122.39,
        image_url: null,
      },
      profiles: { display_name: "Maya" },
    };

    const entity = mapActivityRow(row, 3);
    expect(entity?.kind).toBe("event");
    expect(entity?.attendeeCount).toBe(3);
    expect(entity?.attendeesPreview).toEqual([]);
    expect(entity?.organizerName).toBe("Maya");
    expect(entity?.locationLabel).toBe("Embarcadero");
    expect(entity?.coordinates.lat).toBe(37.79);
    expect(entity?.costCents).toBe(500);
  });

  it("prefers Meetup venue/host labels for Apify rows without profiles", () => {
    const row: DbActivityWithRelations = {
      id: "a2",
      title: "Oakland Hike",
      description: "Trail walk",
      category: "hiking",
      place_id: null,
      organizer_id: null,
      starts_at: "2026-11-02T22:00:00.000Z",
      ends_at: null,
      capacity: null,
      image_url: null,
      source_type: "apify",
      source_url: "https://www.meetup.com/example/events/1/",
      source_provider: "meetup",
      source_record_id: "1",
      imported_at: "2026-10-24T00:00:00.000Z",
      last_verified_at: "2026-10-24T00:00:00.000Z",
      import_run_id: "run-1",
      latitude: 37.81,
      longitude: -122.17,
      difficulty_label: null,
      location_label: "Redwood Gate · Oakland, CA",
      host_label: "East Bay Hikers",
      cost_cents: null,
      created_at: "2026-10-24T00:00:00.000Z",
      updated_at: "2026-10-24T00:00:00.000Z",
      places: null,
      profiles: null,
    };
    const entity = mapActivityRow(row, 0);
    expect(entity?.provenance).toBe("apify");
    expect(entity?.locationLabel).toBe("Redwood Gate · Oakland, CA");
    expect(entity?.organizerName).toBe("East Bay Hikers");
    expect(entity?.sourceUrl).toContain("meetup.com");
    expect(entity?.costCents).toBeNull();
  });

  it("reconciles stored Free (0) when description states Fee: $18", () => {
    const row: DbActivityWithRelations = {
      id: "a-fee",
      title: "BBC Doubles Badminton",
      description:
        "Doubles badminton. Fee: $18 per person, paid directly to the Club at entry.",
      category: "sports",
      place_id: null,
      organizer_id: null,
      starts_at: "2026-11-02T20:00:00.000Z",
      ends_at: null,
      capacity: null,
      image_url: null,
      source_type: "apify",
      source_url: "https://www.meetup.com/example/events/fee/",
      source_provider: "meetup",
      source_record_id: "fee",
      imported_at: "2026-10-24T00:00:00.000Z",
      last_verified_at: "2026-10-24T00:00:00.000Z",
      import_run_id: "run-1",
      latitude: 37.81,
      longitude: -122.17,
      difficulty_label: "Open to all",
      location_label: "Bay Badminton Center",
      host_label: "BBC",
      cost_cents: 0,
      created_at: "2026-10-24T00:00:00.000Z",
      updated_at: "2026-10-24T00:00:00.000Z",
      places: null,
      profiles: null,
    };
    const entity = mapActivityRow(row, 0);
    expect(entity?.costCents).toBe(1800);
  });

  it("rejects activities without coordinates", () => {
    const row = {
      id: "a1",
      title: "No place",
      description: "",
      category: "hiking",
      place_id: null,
      organizer_id: null,
      starts_at: "2026-11-01T16:00:00.000Z",
      ends_at: null,
      capacity: null,
      image_url: null,
      source_type: "community",
      source_url: null,
      source_provider: null,
      source_record_id: null,
      imported_at: null,
      last_verified_at: null,
      import_run_id: null,
      latitude: null,
      longitude: null,
      difficulty_label: null,
      location_label: null,
      host_label: null,
      cost_cents: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      places: null,
      profiles: null,
    } satisfies DbActivityWithRelations;

    expect(mapActivityRow(row)).toBeNull();
  });
});

describe("mapDiscoverableProfile", () => {
  it("maps opt-in profiles with approximate pins", () => {
    const row: DbProfile = {
      id: "u1",
      display_name: "Jordan",
      avatar_url: null,
      bio: "Hiker",
      city: "San Francisco",
      neighborhood: null,
      discoverable: true,
      discovery_lat: 37.75,
      discovery_lng: -122.41,
      interests: ["hiking"],
      skill_level: "any",
      availability_days: ["sat"],
      availability_start_hour: 8,
      availability_end_hour: 18,
      preferred_radius_km: 20,
      dm_policy: "discoverable_only",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };
    const entity = mapDiscoverableProfile(row);
    expect(entity?.kind).toBe("person");
    expect(entity?.presenceNote).toMatch(/not a live/i);
    expect(entity?.provenance).toBe("supabase");
  });

  it("skips non-discoverable or incomplete profiles", () => {
    expect(
      mapDiscoverableProfile({
        id: "u1",
        display_name: "Hidden",
        avatar_url: null,
        bio: null,
        city: null,
        neighborhood: null,
        discoverable: false,
        discovery_lat: 37.75,
        discovery_lng: -122.41,
        interests: [],
        skill_level: null,
        availability_days: [],
        availability_start_hour: null,
        availability_end_hour: null,
        preferred_radius_km: null,
        dm_policy: "nobody",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      }),
    ).toBeNull();
  });
});
