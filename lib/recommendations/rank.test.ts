import { describe, expect, it } from "vitest";
import { recommendActivities } from "@/lib/recommendations/rank";
import { createDefaultPreferences } from "@/lib/preferences/defaults";
import type { FeedbackEvent } from "@/types/feedback";
import type { EventEntity } from "@/types/map-entities";
import type { UserPreferences } from "@/types/preferences";

function event(
  partial: Partial<EventEntity> & Pick<EventEntity, "id" | "name">,
): EventEntity {
  return {
    kind: "event",
    category: "hiking",
    summary: "test",
    locationLabel: "SF",
    coordinates: { lat: 37.78, lng: -122.42 },
    imageUrl: null,
    imageCredit: null,
    provenance: "mock",
    createdAt: "2026-01-01T00:00:00.000Z",
    startsAt: "2026-10-25T16:00:00.000Z",
    endsAt: "2026-10-25T18:00:00.000Z",
    organizerName: "Org",
    organizerId: "o1",
    sourceUrl: null,
    capacity: 10,
    attendeeCount: 1,
    attendeesPreview: [],
    reviews: [],
    isRegistrationOpen: true,
    difficultyLabel: "Beginner-friendly",
    costCents: 0,
    ...partial,
  };
}

function prefs(overrides: Partial<UserPreferences> = {}): UserPreferences {
  return { ...createDefaultPreferences(), ...overrides };
}

describe("recommendActivities", () => {
  it("excludes over-budget activities when cost is known", () => {
    const result = recommendActivities(
      [
        event({ id: "cheap", name: "Cheap", costCents: 500 }),
        event({ id: "pricey", name: "Pricey", costCents: 5000 }),
      ],
      prefs({ maxBudgetCents: 1000, availableDays: ["sun"] }),
    );
    expect(result.ranked.map((r) => r.activity.id)).toEqual(["cheap"]);
    expect(result.excluded.some((r) => r.activity.id === "pricey")).toBe(true);
    expect(result.method).toBe("deterministic-weighted-rules");
  });

  it("does not treat unknown cost as a budget match or hard fail", () => {
    const result = recommendActivities(
      [event({ id: "unknown", name: "Unknown", costCents: null })],
      prefs({ maxBudgetCents: 1000, availableDays: ["sun"] }),
    );
    expect(result.ranked).toHaveLength(1);
    expect(
      result.ranked[0]?.reasons.some((r) => r.code === "budget_unknown"),
    ).toBe(true);
    expect(
      result.ranked[0]?.reasons.some((r) => r.code === "within_budget"),
    ).toBe(false);
  });

  it("excludes activities beyond max distance when starting point is set", () => {
    const result = recommendActivities(
      [
        event({
          id: "near",
          name: "Near",
          coordinates: { lat: 37.78, lng: -122.42 },
        }),
        event({
          id: "far",
          name: "Far",
          coordinates: { lat: 38.5, lng: -122.5 },
        }),
      ],
      prefs({
        maxDistanceKm: 5,
        availableDays: ["sun"],
        startingPoint: { lat: 37.7749, lng: -122.4194 },
      }),
    );
    expect(result.ranked.map((r) => r.activity.id)).toEqual(["near"]);
    expect(result.excluded.some((e) => e.activity.id === "far")).toBe(true);
  });

  it("excludes schedule mismatches and reports skill unknown honestly", () => {
    const result = recommendActivities(
      [
        event({
          id: "wrong-day",
          name: "Sunday hike",
          startsAt: "2026-10-25T16:00:00.000Z",
          difficultyLabel: "Mystery trek",
        }),
      ],
      prefs({ availableDays: ["mon"], skillPreference: "beginner" }),
    );
    expect(result.ranked).toHaveLength(0);
    expect(result.excluded[0]?.exclusionReason).toMatch(/available days|time/i);
  });

  it("ranks interest matches higher and stays deterministic", () => {
    const preferences = prefs({
      preferredCategories: ["running"],
      availableDays: ["sun"],
      skillPreference: "any",
    });
    const activities = [
      event({ id: "a-hike", name: "Hike", category: "hiking" }),
      event({ id: "b-run", name: "Run", category: "running" }),
    ];
    const first = recommendActivities(activities, preferences);
    const second = recommendActivities(activities, preferences);
    expect(first.ranked.map((r) => r.activity.id)).toEqual(
      second.ranked.map((r) => r.activity.id),
    );
    expect(first.ranked[0]?.activity.id).toBe("b-run");
    expect(
      first.ranked[0]?.reasons.some((r) => r.code === "interest_match"),
    ).toBe(true);
  });

  it("boosts activities with prior positive local feedback", () => {
    const history: FeedbackEvent[] = [
      {
        id: "f1",
        activityId: "saved",
        action: "save",
        rating: null,
        activityCategory: "hiking",
        createdAt: "2026-01-01T00:00:00.000Z",
        storage: "local-demo",
      },
    ];
    const result = recommendActivities(
      [
        event({ id: "saved", name: "Saved" }),
        event({ id: "other", name: "Other" }),
      ],
      prefs({ availableDays: ["sun"], preferredCategories: [] }),
      history,
    );
    expect(result.ranked[0]?.activity.id).toBe("saved");
    expect(
      result.ranked[0]?.reasons.some(
        (r) => r.code === "prior_positive_feedback",
      ),
    ).toBe(true);
  });

  it("hides dismissed recommendations without inventing new matches", () => {
    const history: FeedbackEvent[] = [
      {
        id: "f1",
        activityId: "skip-me",
        action: "skip",
        rating: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        storage: "local-demo",
      },
    ];
    const result = recommendActivities(
      [
        event({ id: "skip-me", name: "Skipped" }),
        event({ id: "keep", name: "Keep" }),
      ],
      prefs({ availableDays: ["sun"], preferredCategories: [] }),
      history,
    );
    expect(result.ranked.map((r) => r.activity.id)).toEqual(["keep"]);
    expect(result.excluded.some((e) => e.activity.id === "skip-me")).toBe(
      true,
    );
    expect(
      result.excluded
        .find((e) => e.activity.id === "skip-me")
        ?.reasons.some((r) => r.code === "dismissed_by_user"),
    ).toBe(true);
  });

  it("soft-boosts similar categories from saves behind explicit interests", () => {
    const history: FeedbackEvent[] = [
      {
        id: "f1",
        activityId: "saved-hike",
        action: "save",
        rating: null,
        activityCategory: "hiking",
        createdAt: "2026-01-01T00:00:00.000Z",
        storage: "local-demo",
      },
    ];
    const result = recommendActivities(
      [
        event({ id: "saved-hike", name: "Saved hike", category: "hiking" }),
        event({ id: "other-hike", name: "Other hike", category: "hiking" }),
        event({ id: "run", name: "Run", category: "running" }),
      ],
      prefs({ availableDays: ["sun"], preferredCategories: [] }),
      history,
    );
    const other = result.ranked.find((r) => r.activity.id === "other-hike");
    const affinity = other?.reasons.find(
      (r) => r.code === "similar_feedback_affinity",
    );
    expect(affinity?.label).toMatch(/saved similar outdoor/i);
  });

  it("never lets feedback override hard budget constraints", () => {
    const history: FeedbackEvent[] = [
      {
        id: "f1",
        activityId: "pricey",
        action: "like",
        rating: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        storage: "local-demo",
      },
    ];
    const result = recommendActivities(
      [
        event({ id: "pricey", name: "Pricey", costCents: 9000 }),
        event({ id: "cheap", name: "Cheap", costCents: 0 }),
      ],
      prefs({
        availableDays: ["sun"],
        maxBudgetCents: 1000,
        preferredCategories: [],
      }),
      history,
    );
    expect(result.ranked.map((r) => r.activity.id)).toEqual(["cheap"]);
    expect(result.excluded.some((e) => e.activity.id === "pricey")).toBe(true);
  });

  it("cold-starts with empty history using baseline prefs only", () => {
    const result = recommendActivities(
      [
        event({ id: "a", name: "A", category: "running" }),
        event({ id: "b", name: "B", category: "hiking" }),
      ],
      prefs({
        availableDays: ["sun"],
        preferredCategories: ["running"],
      }),
      [],
    );
    expect(result.ranked[0]?.activity.id).toBe("a");
    expect(result.methodNote).not.toMatch(/saves\/likes/i);
  });

  it("soft-boosts explicit search intent without inventing new activities", () => {
    const result = recommendActivities(
      [
        event({
          id: "badminton",
          name: "SF Badminton Open Play",
          category: "sports",
          summary: "Casual badminton",
        }),
        event({
          id: "hike",
          name: "Twin Peaks Walk",
          category: "hiking",
          summary: "City views",
        }),
      ],
      prefs({
        availableDays: ["sun"],
        preferredCategories: [],
        skillPreference: "any",
      }),
      [],
      { searchIntent: "badminton" },
    );
    expect(result.ranked[0]?.activity.id).toBe("badminton");
    expect(
      result.ranked[0]?.reasons.some((r) => r.code === "search_intent_match"),
    ).toBe(true);
    expect(result.ranked.map((r) => r.activity.id)).toEqual(
      expect.arrayContaining(["badminton", "hike"]),
    );
  });
});

describe("applyFeedbackToRecommendationResult", () => {
  it("re-applies dismiss on an upstream ranking", async () => {
    const { applyFeedbackToRecommendationResult } = await import(
      "@/lib/recommendations/rank"
    );
    const base = recommendActivities(
      [
        event({ id: "a", name: "A" }),
        event({ id: "b", name: "B" }),
      ],
      prefs({ availableDays: ["sun"], preferredCategories: [] }),
      [],
    );
    const next = applyFeedbackToRecommendationResult(base, [
      {
        id: "f1",
        activityId: "a",
        action: "skip",
        rating: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        storage: "local-demo",
      },
    ]);
    expect(next.ranked.every((r) => r.activity.id !== "a")).toBe(true);
    expect(next.methodNote).toMatch(/rules/i);
  });
});
