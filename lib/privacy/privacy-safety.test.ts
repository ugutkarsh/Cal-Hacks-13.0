import { describe, expect, it, beforeEach } from "vitest";
import { excludeBlockedIds } from "@/lib/privacy/blocks";
import {
  checkRateLimit,
  resetRateLimitsForTests,
} from "@/lib/privacy/rate-limit";
import {
  parseReportCreate,
  reportsArePubliclyListable,
} from "@/lib/privacy/reports";
import { publicApiError } from "@/lib/privacy/safe-error";
import { mapPublicProfile } from "@/lib/profiles/mappers";
import { assertDiscoverableCoords } from "@/lib/profiles/validation";
import {
  canViewerReadPost,
  type PostVisibilityInput,
} from "@/lib/community/visibility";
import type { DbProfile } from "@/types/database";

const OWNER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const STRANGER = "cccccccc-cccc-cccc-cccc-cccccccccccc";

function baseProfile(partial: Partial<DbProfile> = {}): DbProfile {
  return {
    id: OTHER,
    display_name: "Blake",
    avatar_url: null,
    bio: null,
    city: "San Francisco",
    neighborhood: "Mission",
    discoverable: true,
    discovery_lat: 37.76,
    discovery_lng: -122.42,
    location_share_level: "approximate",
    interests: ["badminton"],
    skill_level: "any",
    availability_days: ["sat"],
    availability_start_hour: 10,
    availability_end_hour: 12,
    preferred_radius_km: 15,
    dm_policy: "discoverable_only",
    created_at: "2026-10-24T12:00:00.000Z",
    updated_at: "2026-10-24T12:00:00.000Z",
    ...partial,
  };
}

function visPost(
  partial: Partial<PostVisibilityInput> = {},
): PostVisibilityInput {
  return {
    ownerId: OWNER,
    visibility: "public",
    status: "open",
    authorDiscoverable: true,
    ...partial,
  };
}

describe("privacy — hidden / private / blocked exclusion", () => {
  it("hidden location share is not publicly mapped even if discoverable flag set", () => {
    const pub = mapPublicProfile(
      baseProfile({ location_share_level: "hidden", discoverable: true }),
    );
    expect(pub).toBeNull();
  });

  it("undiscoverable profiles are excluded from public projection", () => {
    expect(
      mapPublicProfile(baseProfile({ discoverable: false })),
    ).toBeNull();
  });

  it("city_only public profile omits map pin", () => {
    const pub = mapPublicProfile(
      baseProfile({
        location_share_level: "city_only",
        discovery_lat: null,
        discovery_lng: null,
      }),
    );
    expect(pub).not.toBeNull();
    expect(pub!.discoveryLat).toBeNull();
    expect(pub!.discoveryLng).toBeNull();
    expect(pub!.city).toBe("San Francisco");
    expect(JSON.stringify(pub)).not.toContain("dm_policy");
  });

  it("blocked peers are stripped from recommendation candidates", () => {
    const people = [{ id: OTHER }, { id: STRANGER }, { id: OWNER }];
    const blocked = new Set([OTHER]);
    expect(excludeBlockedIds(people, blocked).map((p) => p.id)).toEqual([
      STRANGER,
      OWNER,
    ]);
  });

  it("archived posts are not readable by strangers", () => {
    const archived = visPost({ status: "archived" });
    expect(canViewerReadPost(archived, STRANGER)).toBe(false);
    expect(canViewerReadPost(archived, OWNER)).toBe(true);
  });

  it("private posts are not readable by strangers", () => {
    const priv = visPost({ visibility: "private" });
    expect(canViewerReadPost(priv, STRANGER)).toBe(false);
    expect(canViewerReadPost(priv, OWNER)).toBe(true);
  });
});

describe("privacy — reports are private", () => {
  it("reports are never publicly listable", () => {
    expect(reportsArePubliclyListable()).toBe(false);
  });

  it("parseReportCreate ignores forged reporterId", () => {
    const r = parseReportCreate({
      targetType: "post",
      targetId: "11111111-1111-1111-1111-111111111111",
      reason: "spam",
      reporterId: STRANGER,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).not.toHaveProperty("reporterId");
    }
  });

  it("rejects invalid report targets/reasons", () => {
    expect(
      parseReportCreate({
        targetType: "admin",
        targetId: "11111111-1111-1111-1111-111111111111",
        reason: "spam",
      }).ok,
    ).toBe(false);
  });

  it("accepts reply and message targets", () => {
    expect(
      parseReportCreate({
        targetType: "reply",
        targetId: "11111111-1111-1111-1111-111111111111",
        reason: "harassment",
      }).ok,
    ).toBe(true);
    expect(
      parseReportCreate({
        targetType: "message",
        targetId: "11111111-1111-1111-1111-111111111111",
        reason: "spam",
      }).ok,
    ).toBe(true);
  });
});

describe("privacy — rate limits and safe errors", () => {
  beforeEach(() => {
    resetRateLimitsForTests();
  });

  it("rate-limits repeated post creates", () => {
    for (let i = 0; i < 10; i++) {
      expect(checkRateLimit("post_create", OWNER).ok).toBe(true);
    }
    expect(checkRateLimit("post_create", OWNER).ok).toBe(false);
  });

  it("does not leak schema text in public errors", () => {
    expect(
      publicApiError("Create failed", {
        message: 'relation "messages" does not exist',
      }),
    ).toBe("Create failed");
    expect(
      publicApiError("x", { message: "new row violates row-level security" }),
    ).toBe("Not allowed");
  });
});

describe("privacy — discoverable + share level", () => {
  it("city_only discoverable does not require a pin", () => {
    expect(
      assertDiscoverableCoords({
        discoverable: true,
        discoveryLat: null,
        discoveryLng: null,
        locationShareLevel: "city_only",
      }),
    ).toBeNull();
  });

  it("approximate discoverable requires a pin", () => {
    expect(
      assertDiscoverableCoords({
        discoverable: true,
        discoveryLat: null,
        discoveryLng: null,
        locationShareLevel: "approximate",
      }),
    ).toMatch(/pin/i);
  });
});

describe("privacy — private messages stay off public projections", () => {
  it("public profile mapping never includes message bodies or conversation ids", () => {
    const pub = mapPublicProfile(baseProfile());
    const s = JSON.stringify(pub);
    expect(s).not.toMatch(/conversation/i);
    expect(s).not.toMatch(/"body"/);
    expect(s).not.toContain("dm_policy");
    expect(s).not.toContain("dmPolicy");
  });
});
