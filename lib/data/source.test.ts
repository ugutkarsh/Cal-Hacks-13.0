import { describe, expect, it } from "vitest";
import { resolveDataSourceMode } from "@/lib/data/source";

describe("resolveDataSourceMode", () => {
  it("uses demo when Supabase is not configured", () => {
    expect(
      resolveDataSourceMode({
        hasSupabaseConfig: false,
        dataSourceOverride: undefined,
      }),
    ).toBe("demo");
  });

  it("uses supabase when configured and no override", () => {
    expect(
      resolveDataSourceMode({
        hasSupabaseConfig: true,
        dataSourceOverride: undefined,
      }),
    ).toBe("supabase");
  });

  it("honors explicit demo override even when Supabase is configured", () => {
    expect(
      resolveDataSourceMode({
        hasSupabaseConfig: true,
        dataSourceOverride: "demo",
      }),
    ).toBe("demo");
  });

  it("falls back to demo if supabase override is set without credentials", () => {
    expect(
      resolveDataSourceMode({
        hasSupabaseConfig: false,
        dataSourceOverride: "supabase",
      }),
    ).toBe("demo");
  });
});
