import { describe, expect, it } from "vitest";
import {
  inferTargetKinds,
  parseNlSearchQuery,
  sanitizeNlCriteria,
} from "@/lib/nl-search/extract-query";

describe("parseNlSearchQuery — varied requests", () => {
  it("1. badminton players in SF Saturday evening", () => {
    const r = parseNlSearchQuery(
      "Find badminton players in San Francisco this Saturday evening.",
    );
    expect(r.engine).toBe("deterministic-rules");
    expect(r.criteria.activity).toBe("badminton");
    expect(r.criteria.city).toBe("San Francisco");
    expect(r.criteria.preferredDays).toContain("sat");
    expect(r.criteria.timeStartHour).toBe(17);
    expect(r.criteria.kinds).toContain("person");
  });

  it("2. easy hike near me this weekend", () => {
    const r = parseNlSearchQuery(
      "I want an easy hike near me this weekend.",
    );
    expect(r.criteria.activity).toBe("hiking");
    expect(r.criteria.skillLevel).toBe("beginner");
    expect(r.criteria.useNearMe).toBe(true);
    expect(r.criteria.preferredDays).toEqual(
      expect.arrayContaining(["sat", "sun"]),
    );
    expect(r.criteria.kinds).toEqual(
      expect.arrayContaining(["place", "event"]),
    );
  });

  it("3. beginner-friendly football after work", () => {
    const r = parseNlSearchQuery(
      "Find a beginner-friendly football game after work.",
    );
    expect(r.criteria.activity).toBe("soccer");
    expect(r.criteria.skillLevel).toBe("beginner");
    expect(r.criteria.timeStartHour).toBe(17);
    expect(r.criteria.kinds).toContain("event");
  });

  it("4. meet people who enjoy photography", () => {
    const r = parseNlSearchQuery(
      "I’m new here and want to meet people who enjoy photography.",
    );
    expect(r.criteria.activity).toBe("photography");
    expect(r.criteria.kinds).toContain("person");
    // Do not invent skill from "new here"
    expect(r.criteria.skillLevel).toBeNull();
  });

  it("5. ambiguous multiple cities needs review", () => {
    const r = parseNlSearchQuery(
      "Looking for tennis in San Francisco or Oakland this Friday.",
    );
    expect(r.criteria.city).toBeNull();
    expect(r.needsReview).toBe(true);
    expect(r.reviewNotes.some((n) => /cities/i.test(n))).toBe(true);
  });

  it("6. missing location notes review without inventing a city", () => {
    const r = parseNlSearchQuery("Looking for a yoga class this Thursday.");
    expect(r.criteria.activity).toBe("yoga");
    expect(r.criteria.city).toBeNull();
    expect(r.reviewNotes.some((n) => /No city/i.test(n))).toBe(true);
  });

  it("7. free budget stated", () => {
    const r = parseNlSearchQuery("Free climbing meetup in Berkeley Saturday.");
    expect(r.criteria.activity).toBe("climbing");
    expect(r.criteria.budgetCents).toBe(0);
    expect(r.criteria.city).toBe("Berkeley");
  });

  it("8. dollar budget stated", () => {
    const r = parseNlSearchQuery(
      "Find a cycling meetup in Palo Alto under $20.",
    );
    expect(r.criteria.activity).toBe("cycling");
    expect(r.criteria.budgetCents).toBe(2000);
  });

  it("9. ambiguous activities need review", () => {
    const r = parseNlSearchQuery(
      "Anyone for badminton or tennis near Mission this weekend?",
    );
    expect(r.criteria.activity).toBeNull();
    expect(r.needsReview).toBe(true);
  });

  it("10. unsupported demographic constraint noted, not searched as filter", () => {
    const r = parseNlSearchQuery(
      "Find guaranteed-spot hiking only women age 25 in SF Saturday.",
    );
    expect(r.criteria.activity).toBe("hiking");
    expect(r.criteria.city).toBe("San Francisco");
    expect(
      r.reviewNotes.some((n) => /not searchable|ignored/i.test(n)),
    ).toBe(true);
  });

  it("11. empty message needs review", () => {
    const r = parseNlSearchQuery("   ");
    expect(r.needsReview).toBe(true);
    expect(r.criteria.activity).toBeNull();
  });

  it("12. morning daypart inference", () => {
    const r = parseNlSearchQuery("Morning run in Oakland on Sunday.");
    expect(r.criteria.activity).toBe("running");
    expect(r.criteria.timeStartHour).toBe(6);
    expect(r.criteria.timeEndHour).toBe(11);
  });
});

describe("inferTargetKinds", () => {
  it("maps meet-people phrasing to person", () => {
    expect(inferTargetKinds("meet people who enjoy hiking", ["find_teammates"])).toContain(
      "person",
    );
  });

  it("maps trail phrasing to place", () => {
    expect(inferTargetKinds("hiking trails near me", null)).toContain("place");
  });
});

describe("sanitizeNlCriteria", () => {
  it("rejects invalid payloads", () => {
    expect(sanitizeNlCriteria(null)).toBeNull();
    expect(sanitizeNlCriteria("x")).toBeNull();
  });

  it("clamps edited criteria", () => {
    const c = sanitizeNlCriteria({
      activity: "  badminton  ",
      category: "sports",
      city: "San Francisco",
      preferredDays: ["sat", "nope"],
      kinds: ["person", "spaceship"],
      skillLevel: "beginner",
      budgetCents: 500,
      useNearMe: true,
    });
    expect(c?.activity).toBe("badminton");
    expect(c?.preferredDays).toEqual(["sat"]);
    expect(c?.kinds).toEqual(["person"]);
    expect(c?.useNearMe).toBe(true);
  });
});
