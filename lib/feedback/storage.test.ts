/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearFeedbackEvents,
  loadFeedbackEvents,
  recordFeedbackEvent,
} from "@/lib/feedback/storage";

describe("feedback storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("persists and clears per-owner feedback", () => {
    recordFeedbackEvent(
      { activityId: "e1", action: "save", activityCategory: "hiking" },
      "user-a",
    );
    recordFeedbackEvent({ activityId: "e2", action: "like" }, "user-a");
    expect(loadFeedbackEvents("user-a")).toHaveLength(2);
    expect(loadFeedbackEvents("user-b")).toHaveLength(0);

    clearFeedbackEvents("user-a");
    expect(loadFeedbackEvents("user-a")).toHaveLength(0);
  });

  it("does not leak guest feedback into a signed-in bucket", () => {
    recordFeedbackEvent({ activityId: "g1", action: "skip" }, null);
    expect(loadFeedbackEvents(null).some((e) => e.activityId === "g1")).toBe(
      true,
    );
    expect(loadFeedbackEvents("signed-in").some((e) => e.activityId === "g1")).toBe(
      false,
    );
  });
});
