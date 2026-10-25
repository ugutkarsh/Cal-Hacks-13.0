import { describe, expect, it } from "vitest";
import { summarizeReviewThemes } from "@/lib/reviews/themes";

describe("summarizeReviewThemes", () => {
  it("returns empty when there are no reviews", () => {
    expect(summarizeReviewThemes([])).toEqual({
      themes: [],
      hasSourceReviews: false,
    });
  });

  it("extracts themes only from provided review text", () => {
    const summary = summarizeReviewThemes([
      {
        id: "rev-1",
        authorName: "Sam",
        rating: 5,
        comment: "Well-paced and friendly group. Great views.",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "rev-2",
        authorName: "Priya",
        rating: 4,
        comment: "Bring layers — it gets windy.",
        createdAt: "2026-01-02T00:00:00.000Z",
      },
    ]);
    expect(summary.hasSourceReviews).toBe(true);
    expect(summary.themes.some((t) => t.theme === "group_experience")).toBe(
      true,
    );
    expect(summary.themes.some((t) => t.theme === "difficulty")).toBe(true);
    expect(
      summary.themes.find((t) => t.theme === "group_experience")?.reviewIds,
    ).toContain("rev-1");
  });
});
