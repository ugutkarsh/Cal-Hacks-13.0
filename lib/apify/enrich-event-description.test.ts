import { describe, expect, it } from "vitest";
import {
  extractDescriptionFromEventHtml,
  preferRicherDescription,
  stripHtmlToText,
} from "@/lib/apify/enrich-event-description";

describe("extractDescriptionFromEventHtml", () => {
  it("prefers long JSON-LD Event description over short og:description", () => {
    const long =
      "Join us for a Sunday moderate hike at Redwood Park. We meet at Fishway Lot. Bring water, layers, and sturdy shoes for this 7 mile outing with 1000 feet of elevation.";
    const html = `
      <meta property="og:description" content="Short teaser only." />
      <script type="application/ld+json">
        ${JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Event",
          name: "Sunday Hike",
          description: long,
        })}
      </script>
    `;
    const extracted = extractDescriptionFromEventHtml(html);
    expect(extracted).toContain("Fishway Lot");
    expect(extracted!.length).toBeGreaterThan(80);
  });

  it("reads HTML description containers when JSON-LD is truncated", () => {
    const html = `
      <div id="event-details">
        <p>Welcome to open badminton play.</p>
        <p>When &amp; Where: City Gym courts 1-4. Bring your own racket.</p>
        <p>What to Bring: Water, non-marking shoes, shuttlecocks if you have them.</p>
      </div>
    `;
    const extracted = extractDescriptionFromEventHtml(html);
    expect(extracted).toMatch(/badminton/i);
    expect(extracted).toMatch(/racket/i);
  });
});

describe("preferRicherDescription", () => {
  it("keeps summary when enrichment is not meaningfully longer", () => {
    expect(preferRicherDescription("hello world summary text here", "hello")).toBe(
      "hello world summary text here",
    );
  });

  it("uses enrichment when clearly longer", () => {
    const summary = "Short blurb.";
    const rich =
      "Full event details with schedule, location notes, what to bring, and transit tips for attendees.";
    expect(preferRicherDescription(summary, rich)).toBe(rich);
  });

  it("replaces truncated Apify summaries with any longer page extract", () => {
    const summary =
      "Green Lake Pickleball is hosting FREE Beginner Welcome Courts. Every Tuesday from 5:00pm to 8:30pm, and every Thursday from 11:00am...";
    const rich =
      summary.replace(/\.\.\.$/, "") +
      " Bring your own paddle. Courts are first come first served.";
    expect(preferRicherDescription(summary, rich)).toBe(rich);
  });
});

describe("stripHtmlToText", () => {
  it("unwraps basic markup", () => {
    expect(stripHtmlToText("<p>Hello</p><br/>World")).toContain("Hello");
  });
});
