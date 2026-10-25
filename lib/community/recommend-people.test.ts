import { describe, expect, it } from "vitest";
import {
  daysOverlap,
  hoursOverlap,
  recommendPeopleForPost,
  scorePersonForPost,
  type PeopleMatchCandidate,
} from "@/lib/community/recommend-people";
import type { PostMatchQuery } from "@/lib/community/post-to-preferences";

const OWNER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ALICE = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const BOB = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const HIDDEN = "dddddddd-dddd-dddd-dddd-dddddddddddd";

function query(partial: Partial<PostMatchQuery> = {}): PostMatchQuery {
  return {
    activity: "badminton",
    category: "sports",
    city: "San Francisco",
    neighborhood: null,
    preferredDays: ["sat", "sun"],
    timeStartHour: 17,
    timeEndHour: 21,
    skillLevel: null,
    budgetCents: null,
    radiusKm: 20,
    intent: "find_teammates",
    searchCenter: { lat: 37.77, lng: -122.42 },
    interestText: "badminton San Francisco",
    ...partial,
  };
}

function person(
  partial: Partial<PeopleMatchCandidate> & { id: string },
): PeopleMatchCandidate {
  return {
    displayName: "Player",
    bio: null,
    city: "San Francisco",
    neighborhood: null,
    interests: ["badminton", "sports"],
    skillLevel: "intermediate",
    availabilityDays: ["sat", "sun"],
    availabilityStartHour: 16,
    availabilityEndHour: 20,
    preferredRadiusKm: 25,
    discoveryLat: 37.78,
    discoveryLng: -122.41,
    discoverable: true,
    acceptsMessages: true,
    activelyLooking: false,
    activelyLookingNote: null,
    lookingActivity: null,
    ...partial,
  };
}

describe("daysOverlap / hoursOverlap", () => {
  it("finds overlapping days and hours", () => {
    expect(daysOverlap(["sat", "sun"], ["fri", "sat"])).toEqual(["sat"]);
    expect(hoursOverlap(17, 21, 16, 20)).toBe(true);
    expect(hoursOverlap(17, 21, 9, 12)).toBe(false);
    expect(hoursOverlap(17, 21, null, 20)).toBe(false);
  });
});

describe("scorePersonForPost", () => {
  it("matches shared badminton + weekend overlap with evidence", () => {
    const scored = scorePersonForPost(person({ id: ALICE }), query(), {
      viewerId: OWNER,
      postOwnerId: OWNER,
    });
    expect(scored).not.toBeNull();
    expect(scored!.reasons.some((r) => /badminton/i.test(r.label))).toBe(true);
    expect(scored!.reasons.some((r) => r.code === "schedule_overlap")).toBe(
      true,
    );
    expect(scored!.activelyLooking).toBe(false);
  });

  it("hides non-discoverable and owner profiles", () => {
    expect(
      scorePersonForPost(
        person({ id: HIDDEN, discoverable: false }),
        query(),
        { viewerId: OWNER, postOwnerId: OWNER },
      ),
    ).toBeNull();
    expect(
      scorePersonForPost(person({ id: OWNER }), query(), {
        viewerId: ALICE,
        postOwnerId: OWNER,
      }),
    ).toBeNull();
  });

  it("drops people outside radius when center is known", () => {
    const far = person({
      id: BOB,
      discoveryLat: 34.05,
      discoveryLng: -118.24, // LA
    });
    expect(
      scorePersonForPost(far, query({ radiusKm: 15 }), {
        viewerId: OWNER,
        postOwnerId: OWNER,
      }),
    ).toBeNull();
  });

  it("does not claim actively looking without an active post flag", () => {
    const scored = scorePersonForPost(
      person({ id: ALICE, interests: ["badminton"] }),
      query(),
      { viewerId: OWNER, postOwnerId: OWNER },
    );
    expect(scored!.activelyLooking).toBe(false);
    expect(
      scored!.reasons.some((r) => r.code === "active_looking_post"),
    ).toBe(false);
  });

  it("includes active-looking evidence only when flagged", () => {
    const scored = scorePersonForPost(
      person({
        id: ALICE,
        activelyLooking: true,
        activelyLookingNote: "They have an open post (find teammates · badminton)",
      }),
      query(),
      { viewerId: OWNER, postOwnerId: OWNER },
    );
    expect(scored!.activelyLooking).toBe(true);
    expect(scored!.reasons.some((r) => r.code === "active_looking_post")).toBe(
      true,
    );
  });

  it("rejects incompatible explicit skills", () => {
    expect(
      scorePersonForPost(
        person({ id: ALICE, skillLevel: "advanced" }),
        query({ skillLevel: "beginner" }),
        { viewerId: OWNER, postOwnerId: OWNER },
      ),
    ).toBeNull();
  });

  it("returns empty rather than fabricating people", () => {
    const result = recommendPeopleForPost([], query(), {
      viewerId: OWNER,
      postOwnerId: OWNER,
    });
    expect(result.items).toEqual([]);
    expect(result.emptyReason).toMatch(/No discoverable/i);
  });
});
