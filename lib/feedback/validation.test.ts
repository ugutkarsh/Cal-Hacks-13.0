import { describe, expect, it } from "vitest";
import {
  parseFeedbackCreate,
  sanitizeFeedbackList,
} from "@/lib/feedback/validation";

describe("parseFeedbackCreate", () => {
  it("accepts save/like/skip with optional category", () => {
    const parsed = parseFeedbackCreate({
      activityId: "evt-1",
      action: "like",
      activityCategory: "hiking",
      userId: "forged-should-ignore",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.action).toBe("like");
    expect(parsed.value.activityCategory).toBe("hiking");
    expect(parsed.value).not.toHaveProperty("userId");
  });

  it("requires rating 1–5 for rate", () => {
    expect(
      parseFeedbackCreate({ activityId: "e", action: "rate" }).ok,
    ).toBe(false);
    expect(
      parseFeedbackCreate({ activityId: "e", action: "rate", rating: 5 }).ok,
    ).toBe(true);
  });

  it("rejects rating on non-rate actions", () => {
    expect(
      parseFeedbackCreate({
        activityId: "e",
        action: "save",
        rating: 5,
      }).ok,
    ).toBe(false);
  });
});

describe("sanitizeFeedbackList", () => {
  it("drops malformed rows", () => {
    const list = sanitizeFeedbackList([
      {
        id: "1",
        activityId: "a",
        action: "save",
        rating: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        storage: "local-demo",
      },
      { activityId: "b", action: "hack" },
      null,
    ]);
    expect(list).toHaveLength(1);
    expect(list[0]?.activityId).toBe("a");
  });
});
