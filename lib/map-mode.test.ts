import { describe, expect, it } from "vitest";
import { resolveMapRenderMode } from "@/lib/map-mode";

describe("resolveMapRenderMode", () => {
  it("uses fallback when the Maps API key is missing", () => {
    expect(
      resolveMapRenderMode({ hasApiKey: false, mapsLoadFailed: false }),
    ).toBe("fallback");
  });

  it("uses Google Maps when a key is present and load succeeds", () => {
    expect(
      resolveMapRenderMode({ hasApiKey: true, mapsLoadFailed: false }),
    ).toBe("google");
  });

  it("falls back when Maps JS fails to load even with a key", () => {
    expect(
      resolveMapRenderMode({ hasApiKey: true, mapsLoadFailed: true }),
    ).toBe("fallback");
  });
});
