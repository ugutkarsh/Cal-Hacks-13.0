import { describe, expect, it } from "vitest";
import {
  canonicalizeSourceRecordId,
  normalizeSourceUrl,
} from "@/lib/apify/import-draft";

describe("canonicalizeSourceRecordId", () => {
  it("collapses eventbrite:prefix and bare numeric ids", () => {
    expect(
      canonicalizeSourceRecordId("eventbrite", "2003096286916"),
    ).toBe("2003096286916");
    expect(
      canonicalizeSourceRecordId("eventbrite", "eventbrite:2003096286916"),
    ).toBe("2003096286916");
    expect(
      canonicalizeSourceRecordId(
        "eventbrite",
        null,
        "https://www.eventbrite.com/e/buti-beats-halloween-edition-tickets-2003096286916",
      ),
    ).toBe("2003096286916");
  });

  it("extracts meetup event ids from urls", () => {
    expect(
      canonicalizeSourceRecordId(
        "meetup",
        null,
        "https://www.meetup.com/example/events/316099065/",
      ),
    ).toBe("316099065");
  });
});

describe("normalizeSourceUrl", () => {
  it("strips query and trailing slash", () => {
    expect(
      normalizeSourceUrl(
        "https://www.eventbrite.com/e/foo-tickets-1/?utm=x",
      ),
    ).toBe("https://www.eventbrite.com/e/foo-tickets-1");
  });
});
