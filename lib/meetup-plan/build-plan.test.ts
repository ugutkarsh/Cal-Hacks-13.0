import { describe, expect, it } from "vitest";
import { MOCK_MAP_ENTITIES } from "@/data/mock/map-entities";
import { buildMeetupPlan } from "@/lib/meetup-plan/build-plan";

const SF = { lat: 37.7749, lng: -122.4194 };

describe("buildMeetupPlan", () => {
  it("returns needs_info without searching when city is missing", async () => {
    const plan = await buildMeetupPlan({
      message: "Plan a badminton meetup for four this Saturday evening",
      forceDemo: true,
    });
    expect(plan.status).toBe("needs_info");
    expect(plan.options).toEqual([]);
    expect(plan.followUps.some((f) => f.field === "city")).toBe(true);
    expect(plan.disclaimer).toMatch(/not a confirmed booking/i);
    expect(plan.llmConfigured).toBe(false);
  });

  it("suggests real catalog options for SF Saturday badminton-ish sports", async () => {
    const plan = await buildMeetupPlan({
      message:
        "Plan a casual badminton meetup for four people this Saturday evening in San Francisco.",
      confirm: true,
      searchCenter: SF,
      forceDemo: true,
    });
    // Demo catalog may lack exact badminton venues — either suggested from related sports places/events or empty honestly.
    expect(["suggested", "empty"]).toContain(plan.status);
    if (plan.status === "suggested") {
      expect(plan.options.length).toBeGreaterThan(0);
      for (const opt of plan.options) {
        expect(MOCK_MAP_ENTITIES.some((e) => e.id === opt.id)).toBe(true);
        expect(opt.availabilityNote).toMatch(/not verified|may change/i);
      }
      expect(plan.selectedOptionId).toBeTruthy();
      expect(plan.draftShareMessage).toMatch(/not a confirmed booking/i);
    } else {
      expect(plan.emptyReason).toMatch(/Nothing was invented/i);
    }
  });

  it("suggests hike plan options from real demo catalog", async () => {
    const plan = await buildMeetupPlan({
      message:
        "Plan a casual hike for four people this Saturday in San Francisco.",
      confirm: true,
      searchCenter: SF,
      forceDemo: true,
    });
    expect(plan.status).toBe("suggested");
    expect(plan.options.some((o) => o.id === "place-golden-gate-park")).toBe(
      true,
    );
    expect(
      plan.options.every((o) =>
        MOCK_MAP_ENTITIES.some((e) => e.id === o.id),
      ),
    ).toBe(true);
  });

  it("returns empty honestly for unsupported niche activity", async () => {
    const plan = await buildMeetupPlan({
      message: "Plan underwater basket weaving in San Francisco this Saturday",
      criteria: {
        activity: "underwater basket weaving",
        category: null,
        city: "San Francisco",
        neighborhood: null,
        preferredDays: ["sat"],
        timeStartHour: 17,
        timeEndHour: 21,
        skillLevel: null,
        budgetCents: null,
        groupSize: 4,
        vibe: null,
      },
      confirm: true,
      searchCenter: SF,
      forceDemo: true,
    });
    expect(plan.status).toBe("empty");
    expect(plan.options).toEqual([]);
    expect(plan.emptyReason).toMatch(/Nothing was invented/i);
  });

  it("excludes events that are too small for stated group size", async () => {
    const plan = await buildMeetupPlan({
      message: "Plan a hike for 50 people Saturday in San Francisco",
      criteria: {
        activity: "hiking",
        category: "hiking",
        city: "San Francisco",
        neighborhood: null,
        preferredDays: ["sat"],
        timeStartHour: null,
        timeEndHour: null,
        skillLevel: "beginner",
        budgetCents: null,
        groupSize: 50,
        vibe: null,
      },
      confirm: true,
      searchCenter: SF,
      forceDemo: true,
    });
    // Sunrise hike capacity is 10 — must not appear when groupSize=50
    expect(plan.options.every((o) => o.id !== "event-sunrise-hike")).toBe(true);
  });
});
