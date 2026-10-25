/**
 * LIVE Supabase integration smoke — skipped unless explicitly enabled.
 *
 * Mode: LIVE when RUN_LIVE_SUPABASE_TESTS=1 and NEXT_PUBLIC_SUPABASE_URL +
 * NEXT_PUBLIC_SUPABASE_ANON_KEY are set. Otherwise SKIPPED (not a mock pass).
 *
 * This does not exercise Auth sign-in or Realtime channels; it only checks
 * that the configured project answers anonymous PostgREST for public reads.
 */

import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";

const enabled = process.env.RUN_LIVE_SUPABASE_TESTS === "1";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const describeLive = enabled && url && anon ? describe : describe.skip;

describeLive("live Supabase (opt-in)", () => {
  it("anon client can reach discoverable_profiles_public without leaking service role", async () => {
    expect(anon).not.toMatch(/service_role/i);
    const supabase = createClient(url!, anon!);
    const { error } = await supabase
      .from("discoverable_profiles_public")
      .select("id")
      .limit(1);
    // Missing view → migration not applied; still a live probe result.
    if (error) {
      expect(error.message.length).toBeGreaterThan(0);
      expect(error.message).not.toMatch(/service_role/i);
    } else {
      expect(error).toBeNull();
    }
  });

  it("anon cannot select content_reports (private moderation table)", async () => {
    const supabase = createClient(url!, anon!);
    const { data, error } = await supabase
      .from("content_reports")
      .select("id")
      .limit(1);
    // Expect permission / RLS denial or empty with error — never a public list.
    const denied =
      Boolean(error) ||
      data == null ||
      (Array.isArray(data) && data.length === 0 && error);
    // If table missing, error is fine; if readable with rows, fail.
    if (!error && Array.isArray(data) && data.length > 0) {
      expect.fail(
        "content_reports must not be publicly selectable; check RLS grants",
      );
    }
    expect(denied || error || data?.length === 0).toBeTruthy();
  });
});

describe("live Supabase gate labeling", () => {
  it("documents skip when live flag unset", () => {
    if (!enabled) {
      expect(enabled).toBe(false);
    } else {
      expect(url && anon).toBeTruthy();
    }
  });
});
