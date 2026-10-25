import { describe, expect, it } from "vitest";
import {
  activityMatchInList,
  activityMatchInText,
  relatedActivities,
} from "@/lib/community/activity-affinity";

describe("activity affinity", () => {
  it("detects exact and related racket sports", () => {
    expect(activityMatchInText("SF Badminton Club courts", "Badminton")).toBe(
      "exact",
    );
    expect(
      activityMatchInText("Mission pickleball courts", "badminton"),
    ).toBe("related");
    expect(activityMatchInText("Bachata dance night", "badminton")).toBe(
      "none",
    );
  });

  it("matches interests lists", () => {
    expect(activityMatchInList(["sports", "badminton"], "Badminton")).toBe(
      "exact",
    );
    expect(activityMatchInList(["pickleball"], "badminton")).toBe("related");
    expect(activityMatchInList(["hiking"], "badminton")).toBe("none");
  });

  it("lists related activities for badminton", () => {
    expect(relatedActivities("badminton")).toEqual(
      expect.arrayContaining(["pickleball", "tennis"]),
    );
  });
});
