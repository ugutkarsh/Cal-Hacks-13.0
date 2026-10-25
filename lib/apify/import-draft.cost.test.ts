import { describe, expect, it } from "vitest";
import {
  descriptionMentionsPaidFee,
  inferCostCentsFromText,
  resolveCostCents,
} from "@/lib/apify/import-draft";

describe("inferCostCentsFromText", () => {
  it("parses Fee: $18 per person", () => {
    const text =
      "Doubles badminton. Fee: $18 per person, paid directly to the Club at entry.";
    expect(inferCostCentsFromText(text)).toBe(1800);
    expect(descriptionMentionsPaidFee(text)).toBe(true);
  });

  it("returns null when no amount is stated", () => {
    expect(inferCostCentsFromText("Bring water and shoes.")).toBeNull();
  });
});

describe("resolveCostCents", () => {
  it("does not keep Free when isFree contradicts description fee", () => {
    expect(
      resolveCostCents({
        structuredCents: null,
        isFree: true,
        description: "Fee: $18 per person, paid at entry",
      }),
    ).toBe(1800);
  });

  it("keeps Free when isFree and no fee language", () => {
    expect(
      resolveCostCents({
        structuredCents: null,
        isFree: true,
        description: "Community open gym — free for members",
      }),
    ).toBe(0);
  });

  it("prefers structured positive price", () => {
    expect(
      resolveCostCents({
        structuredCents: 2500,
        isFree: false,
        description: "Fee: $18",
      }),
    ).toBe(2500);
  });

  it("clears stored 0 when description has a fee but no parseable amount", () => {
    expect(
      resolveCostCents({
        structuredCents: 0,
        isFree: true,
        description: "Paid directly to the Club at entry (cash).",
      }),
    ).toBeNull();
  });
});
