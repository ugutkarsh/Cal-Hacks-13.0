import { describe, expect, it } from "vitest";
import {
  rankCompatibleTeammates,
  scorePeerCompatibility,
  viewerFromOwnProfile,
} from "@/lib/community/compatibility";
import type { PeopleMatchCandidate } from "@/lib/community/recommend-people";
import type { CompatibilityViewer } from "@/types/compatibility";

function peer(
  overrides: Partial<PeopleMatchCandidate> & { id: string },
): PeopleMatchCandidate {
  return {
    displayName: overrides.displayName ?? `User ${overrides.id}`,
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
    ...overrides,
  };
}

const viewer: CompatibilityViewer = {
  id: "viewer-1",
  interests: ["badminton", "hiking"],
  skillLevel: "beginner",
  availabilityDays: ["sat", "sun"],
  availabilityStartHour: 16,
  availabilityEndHour: 21,
  city: "San Francisco",
  discoveryLat: 37.77,
  discoveryLng: -122.42,
  preferredRadiusKm: 40,
};

describe("scorePeerCompatibility", () => {
  it("explains shared badminton interest from real interests arrays", () => {
    const match = scorePeerCompatibility(viewer, peer({ id: "p1" }));
    expect(match).not.toBeNull();
    expect(match!.sharedInterests).toContain("badminton");
    expect(
      match!.reasons.some((r) => /Both interested in badminton/i.test(r.label)),
    ).toBe(true);
    expect(match!.scorePercent).toBeGreaterThan(0);
    expect(match!.scorePercent).toBeLessThanOrEqual(100);
  });

  it("explains Saturday evening availability overlap when both stated it", () => {
    const match = scorePeerCompatibility(viewer, peer({ id: "p2" }));
    expect(
      match!.reasons.some((r) => /Availability overlaps sat/i.test(r.label)),
    ).toBe(true);
    expect(
      match!.reasons.some((r) => /time window/i.test(r.label)),
    ).toBe(true);
  });

  it("does not invent availability explanations when peer has no days", () => {
    const match = scorePeerCompatibility(
      viewer,
      peer({
        id: "p3",
        availabilityDays: [],
        availabilityStartHour: null,
        availabilityEndHour: null,
      }),
    );
    expect(match).not.toBeNull();
    expect(
      match!.reasons.some((r) => r.code === "schedule_overlap"),
    ).toBe(false);
  });

  it("skips interest factor without penalizing when viewer has no interests", () => {
    const thinViewer: CompatibilityViewer = {
      ...viewer,
      interests: [],
    };
    const match = scorePeerCompatibility(
      thinViewer,
      peer({ id: "p4", interests: ["badminton"] }),
    );
    // May still match on schedule + area
    expect(match).not.toBeNull();
    expect(
      match!.reasons.some((r) => r.code === "shared_interest"),
    ).toBe(false);
    // rawMax should not include full interest weight unfairly as a zeroed forced factor
    // (interest skipped entirely)
    expect(match!.rawMax).toBeLessThan(
      40 + 20 + 15 + 12 + 18, // would be if all factors including interest forced
    );
  });

  it("hides non-discoverable peers", () => {
    expect(
      scorePeerCompatibility(
        viewer,
        peer({ id: "hidden", discoverable: false }),
      ),
    ).toBeNull();
  });

  it("hides self", () => {
    expect(
      scorePeerCompatibility(viewer, peer({ id: "viewer-1" })),
    ).toBeNull();
  });

  it("rejects hard skill mismatch when both stated skills", () => {
    expect(
      scorePeerCompatibility(
        { ...viewer, skillLevel: "beginner" },
        peer({ id: "adv", skillLevel: "advanced" }),
      ),
    ).toBeNull();
  });

  it("does not invent exact home addresses in reasons", () => {
    const match = scorePeerCompatibility(viewer, peer({ id: "p5" }));
    for (const r of match!.reasons) {
      expect(r.label).not.toMatch(/\d{1,5}\s+\w+\s+(st|street|ave)/i);
    }
  });
});

describe("rankCompatibleTeammates", () => {
  it("excludes blocked peers", () => {
    const result = rankCompatibleTeammates(
      viewer,
      [
        peer({ id: "blocked", interests: ["badminton"] }),
        peer({ id: "ok", interests: ["badminton", "hiking"] }),
      ],
      { blockedIds: new Set(["blocked"]) },
    );
    expect(result.matches.map((m) => m.id)).toEqual(["ok"]);
    expect(result.matches.every((m) => m.id !== "blocked")).toBe(true);
  });

  it("returns honest empty reason when nothing matches", () => {
    const result = rankCompatibleTeammates(
      viewer,
      [
        peer({
          id: "far",
          city: "London",
          discoveryLat: 51.5,
          discoveryLng: -0.1,
          interests: ["yoga"],
          availabilityDays: ["mon"],
        }),
      ],
    );
    expect(result.matches).toEqual([]);
    expect(result.emptyReason).toMatch(/No discoverable profiles/i);
  });

  it("normalizes scores and sorts descending", () => {
    const result = rankCompatibleTeammates(viewer, [
      peer({ id: "weak", interests: ["pickleball"] }), // related to badminton
      peer({
        id: "strong",
        interests: ["badminton", "hiking"],
        availabilityDays: ["sat", "sun"],
      }),
    ]);
    expect(result.matches.length).toBeGreaterThanOrEqual(1);
    for (let i = 1; i < result.matches.length; i++) {
      expect(result.matches[i - 1].scorePercent).toBeGreaterThanOrEqual(
        result.matches[i].scorePercent,
      );
    }
    expect(result.method).toBe("deterministic-profile-compatibility");
  });

  it("viewerFromOwnProfile copies consented fields only", () => {
    const v = viewerFromOwnProfile({
      id: "u1",
      interests: ["cycling"],
      skillLevel: "intermediate",
      availabilityDays: ["wed"],
      availabilityStartHour: 18,
      availabilityEndHour: 20,
      city: "Oakland",
      discoveryLat: 37.8,
      discoveryLng: -122.27,
      preferredRadiusKm: 25,
    });
    expect(v.interests).toEqual(["cycling"]);
    expect(v.city).toBe("Oakland");
  });
});
