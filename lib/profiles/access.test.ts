import { describe, expect, it } from "vitest";
import { mapPublicProfile, ownProfileToDbPatch } from "@/lib/profiles/mappers";
import { parseProfileUpdate } from "@/lib/profiles/validation";
import type { DbProfile } from "@/types/database";

/**
 * Access-control unit tests (no live DB).
 * Mirrors API rules: owners see private fields; others only public discoverable.
 */

const OWNER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OTHER_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function row(partial: Partial<DbProfile>): DbProfile {
  return {
    id: OWNER_ID,
    display_name: "Owner",
    avatar_url: null,
    bio: "bio",
    city: "SF",
    neighborhood: null,
    discoverable: false,
    discovery_lat: null,
    discovery_lng: null,
    interests: [],
    skill_level: null,
    availability_days: [],
    availability_start_hour: null,
    availability_end_hour: null,
    preferred_radius_km: null,
    dm_policy: "nobody",
    created_at: "2026-10-24T00:00:00.000Z",
    updated_at: "2026-10-24T00:00:00.000Z",
    ...partial,
  };
}

describe("profile access restrictions", () => {
  it("private profiles are invisible to other users", () => {
    const privateRow = row({ discoverable: false, dm_policy: "nobody" });
    expect(mapPublicProfile(privateRow)).toBeNull();
  });

  it("discoverable profiles never expose dm_policy to others", () => {
    const pub = mapPublicProfile(
      row({
        discoverable: true,
        discovery_lat: 37.77,
        discovery_lng: -122.42,
        dm_policy: "everyone",
      }),
    );
    expect(pub).not.toBeNull();
    expect(JSON.stringify(pub)).not.toContain("everyone");
    expect(JSON.stringify(pub)).not.toContain("dm_policy");
    expect(JSON.stringify(pub)).not.toContain("dmPolicy");
  });

  it("PATCH body cannot retarget another user id via payload", () => {
    const parsed = parseProfileUpdate({
      displayName: "Hacker",
      id: OTHER_ID,
      userId: OTHER_ID,
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const dbPatch = ownProfileToDbPatch(parsed.value);
    expect(dbPatch).not.toHaveProperty("id");
    expect(dbPatch).not.toHaveProperty("user_id");
    expect(dbPatch.display_name).toBe("Hacker");
  });
});
