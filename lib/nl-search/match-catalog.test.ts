import { describe, expect, it } from "vitest";
import { MOCK_MAP_ENTITIES } from "@/data/mock/map-entities";
import { matchNlCatalog } from "@/lib/nl-search/match-catalog";
import { parseNlSearchQuery } from "@/lib/nl-search/extract-query";
import { runNlSearch } from "@/lib/nl-search/run-search";
import type { NlSearchCriteria } from "@/types/nl-search";

const SF = { lat: 37.7749, lng: -122.4194 };

describe("matchNlCatalog — real mock catalog (no fabricated rows)", () => {
  it("matches easy hike near SF against real hiking place/event ids", () => {
    const parsed = parseNlSearchQuery(
      "I want an easy hike near me this weekend.",
    );
    const { matches, emptyReason } = matchNlCatalog(
      MOCK_MAP_ENTITIES,
      { ...parsed.criteria, city: "San Francisco", useNearMe: true },
      { searchCenter: SF },
    );
    expect(emptyReason).toBeNull();
    expect(matches.length).toBeGreaterThan(0);
    const ids = matches.map((m) => m.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "place-golden-gate-park",
        "event-sunrise-hike",
      ]),
    );
    for (const m of matches) {
      expect(MOCK_MAP_ENTITIES.some((e) => e.id === m.id)).toBe(true);
      expect(m.reasons.length).toBeGreaterThan(0);
    }
  });

  it("matches Saturday run event from catalog", () => {
    const criteria: NlSearchCriteria = {
      activity: "running",
      category: "running",
      city: "San Francisco",
      neighborhood: null,
      preferredDays: ["sat"],
      timeStartHour: null,
      timeEndHour: null,
      skillLevel: null,
      budgetCents: null,
      kinds: ["event"],
      useNearMe: false,
    };
    const { matches } = matchNlCatalog(MOCK_MAP_ENTITIES, criteria, {
      searchCenter: SF,
    });
    expect(matches.some((m) => m.id === "event-bay-run")).toBe(true);
    const bay = matches.find((m) => m.id === "event-bay-run");
    expect(bay?.reasons.some((r) => /running|schedule|Category/i.test(r.label))).toBe(
      true,
    );
  });

  it("matches hiking people from discoverable profiles only", () => {
    const criteria: NlSearchCriteria = {
      activity: "hiking",
      category: "hiking",
      city: null,
      neighborhood: null,
      preferredDays: [],
      timeStartHour: null,
      timeEndHour: null,
      skillLevel: null,
      budgetCents: null,
      kinds: ["person"],
      useNearMe: false,
    };
    const { matches } = matchNlCatalog(MOCK_MAP_ENTITIES, criteria);
    expect(matches.some((m) => m.id === "person-jordan")).toBe(true);
    expect(matches.every((m) => m.kind === "person")).toBe(true);
  });

  it("returns empty without inventing photography people", () => {
    const criteria: NlSearchCriteria = {
      activity: "photography",
      category: "meetup",
      city: "San Francisco",
      neighborhood: null,
      preferredDays: [],
      timeStartHour: null,
      timeEndHour: null,
      skillLevel: null,
      budgetCents: null,
      kinds: ["person"],
      useNearMe: false,
    };
    const { matches, emptyReason } = matchNlCatalog(
      MOCK_MAP_ENTITIES,
      criteria,
      { searchCenter: SF },
    );
    expect(matches).toEqual([]);
    expect(emptyReason).toMatch(/No catalog items matched/i);
  });

  it("excludes over-budget events when budget is stated", () => {
    const criteria: NlSearchCriteria = {
      activity: "cycling",
      category: "cycling",
      city: null,
      neighborhood: null,
      preferredDays: [],
      timeStartHour: null,
      timeEndHour: null,
      skillLevel: null,
      budgetCents: 0,
      kinds: ["event"],
      useNearMe: false,
    };
    const { matches } = matchNlCatalog(MOCK_MAP_ENTITIES, criteria);
    expect(matches.every((m) => m.id !== "event-bike-meetup")).toBe(true);
  });
});

describe("runNlSearch integration (demo catalog)", () => {
  it("parses then searches demo catalog on confirm", async () => {
    const preview = await runNlSearch({
      message: "Easy hike near San Francisco this weekend",
      forceDemo: true,
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;

    // May need review for near-me notes — force confirm with criteria
    const searched = await runNlSearch({
      message: "Easy hike near San Francisco this weekend",
      criteria: {
        ...preview.criteria,
        city: "San Francisco",
        activity: "hiking",
        kinds: ["event", "place"],
      },
      confirm: true,
      searchCenter: SF,
      forceDemo: true,
    });
    expect(searched.ok).toBe(true);
    if (!searched.ok) return;
    expect(searched.searched).toBe(true);
    expect(searched.llmConfigured).toBe(false);
    expect(searched.engine).toBe("deterministic-rules");
    expect(searched.dataSourceLabel.toLowerCase()).toMatch(/demo|mock/);
    for (const m of searched.matches) {
      expect(MOCK_MAP_ENTITIES.some((e) => e.id === m.id)).toBe(true);
    }
  });

  it("returns review without searching when ambiguous", async () => {
    const r = await runNlSearch({
      message: "Tennis in San Francisco or Oakland",
      forceDemo: true,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.needsReview).toBe(true);
    expect(r.searched).toBe(false);
    expect(r.matches).toEqual([]);
  });
});
