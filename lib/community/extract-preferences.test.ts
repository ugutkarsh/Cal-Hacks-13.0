import { describe, expect, it } from "vitest";
import {
  extractPostPreferences,
  parseLocalTimeHour,
  softDaypartHours,
  unavailablePostExtraction,
} from "@/lib/community/extract-preferences";
import {
  applyExtractionConfirmation,
  parseExtractRequest,
  runPostExtraction,
  sanitizeExtractedPreferences,
} from "@/lib/community/extract-validation";

const EXAMPLE =
  "Hi, I'm new in San Francisco and looking to play badminton on Saturdays or Sundays between 5 and 9 PM. If anyone knows a place or needs another player, let me know.";

describe("parseLocalTimeHour", () => {
  it("parses 12h and 24h local wall-clock (not UTC)", () => {
    expect(parseLocalTimeHour("5 PM")).toBe(17);
    expect(parseLocalTimeHour("5pm")).toBe(17);
    expect(parseLocalTimeHour("9 PM")).toBe(21);
    expect(parseLocalTimeHour("12 am")).toBe(0);
    expect(parseLocalTimeHour("12 pm")).toBe(12);
    expect(parseLocalTimeHour("17:00")).toBe(17);
    expect(parseLocalTimeHour("25")).toBeNull();
  });
});

describe("extractPostPreferences — example post", () => {
  it("extracts badminton, SF, weekend days, 5–9 PM, teammate+venue intents", () => {
    const result = extractPostPreferences(EXAMPLE);
    expect(result.engine).toBe("deterministic-rules");
    expect(result.limitation).toMatch(/not an LLM/i);
    expect(result.originalMessage).toBe(EXAMPLE);

    expect(result.extracted.activity.value).toBe("badminton");
    expect(result.extracted.activity.source).toBe("stated");
    expect(result.extracted.city.value).toBe("San Francisco");
    expect(result.extracted.preferredDays.value).toEqual(["sat", "sun"]);
    expect(result.extracted.timeStartHour.value).toBe(17);
    expect(result.extracted.timeEndHour.value).toBe(21);
    expect(result.extracted.intents.value).toEqual(
      expect.arrayContaining(["find_teammates", "find_venue"]),
    );
    expect(result.extracted.skillLevel.source).toBe("unknown");
    expect(result.extracted.budgetCents.source).toBe("unknown");
    // New in city must NOT invent skill
    expect(result.extracted.skillLevel.value).toBeNull();
    // Timezone is advisory; hours remain local
    expect(result.extracted.timeZoneHint.value).toBe("America/Los_Angeles");
    expect(result.extracted.timeZoneHint.note).toMatch(/not converted to UTC/i);
  });
});

describe("missing and ambiguous details", () => {
  it("leaves unknowns when details are missing", () => {
    const result = extractPostPreferences("Anyone free this week?");
    expect(result.extracted.activity.source).toBe("unknown");
    expect(result.extracted.city.source).toBe("unknown");
    expect(result.extracted.preferredDays.source).toBe("unknown");
    expect(result.extracted.timeStartHour.source).toBe("unknown");
    expect(result.extracted.skillLevel.source).toBe("unknown");
  });

  it("marks multiple cities as ambiguous and does not invent a street address", () => {
    const result = extractPostPreferences(
      "Looking to play tennis in Oakland or Berkeley near 123 Main Street.",
    );
    expect(result.extracted.city.source).toBe("ambiguous");
    expect(result.extracted.city.value).toBeNull();
    expect(result.suggestedDraft.city).toBeNull();
    // Original message is preserved; structured city/neighborhood stay labels-only.
    expect(result.originalMessage).toMatch(/123 Main/i);
    expect(result.extracted.city.value).toBeNull();
    expect(result.extracted.neighborhood.value).toBeNull();
  });

  it("marks multiple activities as ambiguous without picking one", () => {
    const result = extractPostPreferences(
      "Looking for badminton or tennis partners in San Francisco on Saturday.",
    );
    expect(result.extracted.activity.source).toBe("ambiguous");
    expect(result.extracted.activity.value).toBeNull();
    expect(result.suggestedDraft.activity).toBeNull();
    expect(result.reviewNotes.some((n) => /multiple activities/i.test(n))).toBe(
      true,
    );
  });

  it("does not invent clock times from evening / after work dayparts", () => {
    const result = extractPostPreferences(
      "Looking for badminton players in SF Saturday evening.",
    );
    expect(result.extracted.timeStartHour.value).toBeNull();
    expect(result.extracted.timeEndHour.value).toBeNull();
    expect(result.suggestedDraft.timeStartHour).toBeNull();
    expect(result.reviewNotes.some((n) => /clock times/i.test(n))).toBe(true);
    // Soft helper remains available for search/planner only.
    expect(softDaypartHours("Saturday evening")).toEqual(
      expect.objectContaining({ start: 17, end: 21 }),
    );
  });

  it("notes unsupported demographic / calendar constraints without guessing", () => {
    const result = extractPostPreferences(
      "Women-only badminton in SF on Oct 25, guaranteed spot, age 25+.",
    );
    expect(result.unsupportedConstraints.length).toBeGreaterThan(0);
    expect(
      result.unsupportedConstraints.some((c) => /demographic/i.test(c)),
    ).toBe(true);
    expect(
      result.unsupportedConstraints.some((c) => /calendar dates/i.test(c)),
    ).toBe(true);
    expect(result.extracted.skillLevel.value).toBeNull();
  });
});

describe("unavailable extraction", () => {
  it("returns engine unavailable without inventing fields", () => {
    const result = unavailablePostExtraction("Looking for a hike");
    expect(result.engine).toBe("unavailable");
    expect(result.limitation).toMatch(/unavailable/i);
    expect(result.suggestedDraft.activity).toBeNull();
    expect(result.originalMessage).toBe("Looking for a hike");
  });
});

describe("time formats", () => {
  it("parses 5-9pm range with shared meridian", () => {
    const result = extractPostPreferences(
      "Badminton in SF on Saturday 5-9pm",
    );
    expect(result.extracted.timeStartHour.value).toBe(17);
    expect(result.extracted.timeEndHour.value).toBe(21);
  });

  it("parses 24h style without converting to another zone", () => {
    const result = extractPostPreferences(
      "Running in Oakland weekdays 07:00-08:00",
    );
    expect(result.extracted.timeStartHour.value).toBe(7);
    expect(result.extracted.timeEndHour.value).toBe(8);
  });
});

describe("sanitizeExtractedPreferences — invalid model output", () => {
  it("drops invented skill/budget and street addresses", () => {
    const sanitized = sanitizeExtractedPreferences({
      activity: { value: "badminton", source: "stated" },
      skillLevel: { value: "advanced", source: "inferred" },
      budgetCents: { value: 2500, source: "inferred" },
      city: {
        value: "500 Market St San Francisco",
        source: "stated",
      },
      radiusKm: { value: 12, source: "inferred" },
      preferredDays: { value: ["sat", "notaday"], source: "stated" },
      intents: { value: ["find_teammates", "hack"], source: "stated" },
    });
    expect(sanitized.skillLevel.source).toBe("unknown");
    expect(sanitized.budgetCents.source).toBe("unknown");
    expect(sanitized.city.source).toBe("ambiguous");
    expect(sanitized.city.value).toBeNull();
    expect(sanitized.radiusKm.source).toBe("unknown");
    expect(sanitized.preferredDays.value).toEqual(["sat"]);
    expect(sanitized.intents.value).toEqual(["find_teammates"]);
  });

  it("handles completely malformed payloads", () => {
    const sanitized = sanitizeExtractedPreferences("not-json");
    expect(sanitized.activity.source).toBe("unknown");
    expect(sanitized.intents.source).toBe("unknown");
  });
});

describe("confirmation / correction", () => {
  it("preserves original message while applying corrected fields", () => {
    const extraction = runPostExtraction(EXAMPLE);
    const confirmed = applyExtractionConfirmation({
      originalMessage: EXAMPLE,
      activity: "badminton",
      city: "San Francisco",
      preferredDays: ["sat"],
      timeStartHour: 18,
      timeEndHour: 21,
      intent: "find_teammates",
      skillLevel: null,
      budgetCents: 0,
    });
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;
    expect(confirmed.createBody.message).toBe(EXAMPLE);
    expect(confirmed.createBody.activity).toBe("badminton");
    expect(confirmed.createBody.timeStartHour).toBe(18);
    expect(confirmed.createBody.preferredDays).toEqual(["sat"]);
    // Extraction suggested both intents; author corrected to one.
    expect(confirmed.createBody.intent).toBe("find_teammates");
    expect(confirmed.createBody.budgetCents).toBe(0);
    expect(extraction.suggestedDraft.activity).toBe("badminton");
    expect(extraction.engine).toBe("deterministic-rules");
  });

  it("rejects confirmation without original message", () => {
    const confirmed = applyExtractionConfirmation({
      originalMessage: "   ",
      activity: "hiking",
    });
    expect(confirmed.ok).toBe(false);
  });
});

describe("parseExtractRequest", () => {
  it("accepts message + optional IANA zone", () => {
    const parsed = parseExtractRequest({
      message: EXAMPLE,
      timeZone: "America/Los_Angeles",
    });
    expect(parsed.ok).toBe(true);
  });

  it("rejects empty message", () => {
    expect(parseExtractRequest({ message: "" }).ok).toBe(false);
  });
});
