import { describe, expect, it } from "vitest";
import {
  dismissedActivityIds,
  positiveActivityIds,
  positiveCategories,
} from "@/lib/feedback/signals";
import type { FeedbackEvent } from "@/types/feedback";

function fb(
  partial: Partial<FeedbackEvent> &
    Pick<FeedbackEvent, "activityId" | "action">,
): FeedbackEvent {
  return {
    id: partial.id ?? `f-${partial.activityId}-${partial.action}`,
    activityId: partial.activityId,
    action: partial.action,
    rating: partial.rating ?? null,
    activityCategory: partial.activityCategory ?? null,
    createdAt: partial.createdAt ?? "2026-01-01T00:00:00.000Z",
    storage: partial.storage ?? "local-demo",
  };
}

describe("feedback signals", () => {
  it("treats latest skip as dismissed", () => {
    const history = [
      fb({
        activityId: "a1",
        action: "save",
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
      fb({
        activityId: "a1",
        action: "skip",
        createdAt: "2026-01-02T00:00:00.000Z",
      }),
    ];
    expect(dismissedActivityIds(history).has("a1")).toBe(true);
    expect(positiveActivityIds(history).has("a1")).toBe(false);
  });

  it("like after skip restores positive", () => {
    const history = [
      fb({
        activityId: "a1",
        action: "skip",
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
      fb({
        activityId: "a1",
        action: "like",
        activityCategory: "hiking",
        createdAt: "2026-01-02T00:00:00.000Z",
      }),
    ];
    expect(dismissedActivityIds(history).has("a1")).toBe(false);
    expect(positiveActivityIds(history).has("a1")).toBe(true);
    expect(positiveCategories(history).has("hiking")).toBe(true);
  });

  it("collects categories only from non-dismissed positives", () => {
    const history = [
      fb({
        activityId: "h1",
        action: "save",
        activityCategory: "hiking",
      }),
      fb({
        activityId: "s1",
        action: "skip",
        activityCategory: "sports",
      }),
    ];
    const cats = positiveCategories(history);
    expect(cats.has("hiking")).toBe(true);
    expect(cats.has("sports")).toBe(false);
  });
});
