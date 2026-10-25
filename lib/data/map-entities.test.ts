import { beforeEach, describe, expect, it, vi } from "vitest";
import { MOCK_MAP_ENTITIES } from "@/data/mock/map-entities";
import { filterMapEntity, loadMapEntities } from "@/lib/data/map-entities";

vi.mock("@/lib/data/supabase-map", () => {
  class SupabaseMapError extends Error {
    name = "SupabaseMapError";
  }
  return {
    SupabaseMapError,
    fetchMapEntitiesFromSupabase: vi.fn(),
  };
});

vi.mock("@/lib/data/source", async () => {
  const actual = await vi.importActual<typeof import("@/lib/data/source")>(
    "@/lib/data/source",
  );
  return {
    ...actual,
    resolveDataSourceMode: vi.fn(() => "demo"),
  };
});

import { fetchMapEntitiesFromSupabase } from "@/lib/data/supabase-map";
import { resolveDataSourceMode } from "@/lib/data/source";

describe("filterMapEntity", () => {
  it("filters by entity kind", () => {
    const people = MOCK_MAP_ENTITIES.filter((entity) =>
      filterMapEntity(entity, {
        search: "",
        category: "all",
        kinds: ["person"],
      }),
    );
    expect(people.length).toBeGreaterThan(0);
    expect(people.every((p) => p.kind === "person")).toBe(true);
  });
});

describe("loadMapEntities", () => {
  beforeEach(() => {
    vi.mocked(resolveDataSourceMode).mockReturnValue("demo");
    vi.mocked(fetchMapEntitiesFromSupabase).mockReset();
  });

  it("returns demo entities with mock provenance", async () => {
    const result = await loadMapEntities({
      search: "",
      category: "all",
      kinds: ["place", "event", "person"],
    });

    expect(result.error).toBeNull();
    expect(result.meta.mode).toBe("demo");
    expect(result.entities.length).toBeGreaterThan(0);
    expect(result.entities.every((e) => e.provenance === "mock")).toBe(true);
    expect(fetchMapEntitiesFromSupabase).not.toHaveBeenCalled();
  });

  it("labels discoverable people as non-live mock pins", async () => {
    const result = await loadMapEntities({
      search: "",
      category: "all",
      kinds: ["person"],
    });
    for (const person of result.entities) {
      expect(person.kind).toBe("person");
      if (person.kind === "person") {
        expect(person.presenceNote).toMatch(/not a live location/i);
      }
    }
  });

  it("filters by category and search", async () => {
    const result = await loadMapEntities({
      search: "sunrise",
      category: "hiking",
      kinds: ["event"],
    });

    expect(result.error).toBeNull();
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]?.name).toMatch(/Sunrise/i);
  });

  it("returns empty when nothing matches", async () => {
    const result = await loadMapEntities({
      search: "zzzz-no-match",
      category: "all",
      kinds: ["place"],
    });

    expect(result.entities).toHaveLength(0);
  });

  it("does not silently replace a Supabase failure with mock data", async () => {
    vi.mocked(resolveDataSourceMode).mockReturnValue("supabase");
    const { SupabaseMapError } = await import("@/lib/data/supabase-map");
    vi.mocked(fetchMapEntitiesFromSupabase).mockRejectedValue(
      new SupabaseMapError("relation places does not exist"),
    );

    const result = await loadMapEntities({
      search: "",
      category: "all",
      kinds: ["place", "event", "person"],
    });

    expect(result.meta.mode).toBe("supabase");
    expect(result.error).toMatch(/places does not exist/i);
    expect(result.entities).toEqual([]);
    expect(result.canUseDemoFallback).toBe(true);
    expect(result.entities.some((e) => e.provenance === "mock")).toBe(false);
  });

  it("returns empty supabase results without substituting mock data", async () => {
    vi.mocked(resolveDataSourceMode).mockReturnValue("supabase");
    vi.mocked(fetchMapEntitiesFromSupabase).mockResolvedValue([]);

    const result = await loadMapEntities({
      search: "",
      category: "all",
      kinds: ["place", "event", "person"],
    });

    expect(result.error).toBeNull();
    expect(result.meta.mode).toBe("supabase");
    expect(result.entities).toEqual([]);
  });
});
