import { describe, expect, it } from "vitest";
import { formatEventWhen } from "@/lib/utils";

describe("formatEventWhen", () => {
  it("includes weekday, calendar date, and time", () => {
    const label = formatEventWhen("2026-10-26T22:00:00.000Z");
    expect(label).toMatch(/Oct/);
    expect(label).toMatch(/26/);
    expect(label).toContain("·");
  });
});
