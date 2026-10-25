import { describe, expect, it } from "vitest";
import {
  buildDraftShareMessage,
  buildFollowUps,
  essentialFollowUps,
  extractGroupSize,
  parseMeetupPlanRequest,
  sanitizeMeetupCriteria,
} from "@/lib/meetup-plan/extract-plan";

describe("extractGroupSize", () => {
  it("parses numeric and word group sizes", () => {
    expect(
      extractGroupSize("Plan badminton for four people this Saturday"),
    ).toBe(4);
    expect(extractGroupSize("meetup for 6 friends")).toBe(6);
    expect(extractGroupSize("group of 3")).toBe(3);
  });

  it("does not invent a group size", () => {
    expect(extractGroupSize("Plan a casual hike in SF")).toBeNull();
  });
});

describe("parseMeetupPlanRequest", () => {
  it("extracts badminton SF Saturday evening plan fields", () => {
    const r = parseMeetupPlanRequest(
      "Plan a casual badminton meetup for four people this Saturday evening in San Francisco.",
    );
    expect(r.criteria.activity).toBe("badminton");
    expect(r.criteria.city).toBe("San Francisco");
    expect(r.criteria.preferredDays).toContain("sat");
    expect(r.criteria.timeStartHour).toBe(17);
    expect(r.criteria.groupSize).toBe(4);
    expect(r.criteria.vibe).toBe("casual");
    expect(essentialFollowUps(r.followUps)).toHaveLength(0);
  });

  it("asks follow-ups when activity and city are missing", () => {
    const r = parseMeetupPlanRequest("Plan something fun this weekend");
    const essential = essentialFollowUps(r.followUps);
    expect(essential.some((f) => f.field === "activity")).toBe(true);
  });

  it("asks for city when missing", () => {
    const r = parseMeetupPlanRequest("Plan a tennis meetup for 3 on Saturday");
    expect(r.criteria.activity).toBe("tennis");
    expect(
      essentialFollowUps(r.followUps).some((f) => f.field === "city"),
    ).toBe(true);
  });

  it("flags conflicting multi-city as follow-up", () => {
    const r = parseMeetupPlanRequest(
      "Badminton in San Francisco or Oakland this Saturday",
    );
    expect(
      r.followUps.some(
        (f) => f.field === "city" || /city/i.test(f.question),
      ),
    ).toBe(true);
  });
});

describe("sanitizeMeetupCriteria + draft share", () => {
  it("rejects invalid payloads", () => {
    expect(sanitizeMeetupCriteria(null)).toBeNull();
  });

  it("clamps edited criteria", () => {
    const c = sanitizeMeetupCriteria({
      activity: " badminton ",
      city: "San Francisco",
      groupSize: 4,
      preferredDays: ["sat", "nope"],
      budgetCents: 0,
    });
    expect(c?.activity).toBe("badminton");
    expect(c?.groupSize).toBe(4);
    expect(c?.preferredDays).toEqual(["sat"]);
  });

  it("builds a share draft that is not a booking claim", () => {
    const msg = buildDraftShareMessage(
      {
        activity: "badminton",
        category: "sports",
        city: "San Francisco",
        neighborhood: null,
        preferredDays: ["sat"],
        timeStartHour: 17,
        timeEndHour: 21,
        skillLevel: null,
        budgetCents: null,
        groupSize: 4,
        vibe: "casual",
      },
      "Mission Rec Center",
    );
    expect(msg).toMatch(/badminton/i);
    expect(msg).toMatch(/not a confirmed booking/i);
  });

  it("soft follow-ups include group size when missing", () => {
    const qs = buildFollowUps({
      activity: "hiking",
      category: "hiking",
      city: "San Francisco",
      neighborhood: null,
      preferredDays: ["sat"],
      timeStartHour: null,
      timeEndHour: null,
      skillLevel: null,
      budgetCents: null,
      groupSize: null,
      vibe: null,
    });
    expect(qs.some((f) => f.field === "groupSize")).toBe(true);
    expect(essentialFollowUps(qs)).toHaveLength(0);
  });
});
