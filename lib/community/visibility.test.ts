import { describe, expect, it } from "vitest";
import { mapCommunityPost } from "@/lib/community/mappers";
import {
  canViewerMutatePost,
  canViewerReadPost,
} from "@/lib/community/visibility";
import type { DbCommunityPostWithAuthor } from "@/types/database";

const OWNER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function row(
  partial: Partial<DbCommunityPostWithAuthor> = {},
): DbCommunityPostWithAuthor {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    owner_id: OWNER,
    message: "Looking for a running partner",
    activity: "running",
    category: "running",
    city: "SF",
    neighborhood: null,
    preferred_days: ["sat"],
    time_start_hour: 8,
    time_end_hour: 10,
    intent: "find_teammates",
    skill_level: "any",
    budget_cents: null,
    radius_km: 15,
    visibility: "public",
    status: "open",
    created_at: "2026-10-24T12:00:00.000Z",
    updated_at: "2026-10-24T12:00:00.000Z",
    profiles: {
      id: OWNER,
      display_name: "Alex",
      avatar_url: null,
      city: "SF",
      neighborhood: "Mission",
      discoverable: true,
    },
    ...partial,
  };
}

describe("canViewerReadPost", () => {
  it("owners can always read their posts", () => {
    expect(
      canViewerReadPost(
        {
          ownerId: OWNER,
          visibility: "private",
          status: "archived",
          authorDiscoverable: false,
        },
        OWNER,
      ),
    ).toBe(true);
  });

  it("public open posts are readable by anyone", () => {
    expect(
      canViewerReadPost(
        {
          ownerId: OWNER,
          visibility: "public",
          status: "open",
          authorDiscoverable: false,
        },
        null,
      ),
    ).toBe(true);
  });

  it("private posts are hidden from others", () => {
    expect(
      canViewerReadPost(
        {
          ownerId: OWNER,
          visibility: "private",
          status: "open",
          authorDiscoverable: true,
        },
        OTHER,
      ),
    ).toBe(false);
  });

  it("author_discoverable requires discoverable author for others", () => {
    expect(
      canViewerReadPost(
        {
          ownerId: OWNER,
          visibility: "author_discoverable",
          status: "open",
          authorDiscoverable: false,
        },
        OTHER,
      ),
    ).toBe(false);
    expect(
      canViewerReadPost(
        {
          ownerId: OWNER,
          visibility: "author_discoverable",
          status: "open",
          authorDiscoverable: true,
        },
        OTHER,
      ),
    ).toBe(true);
  });

  it("archived posts are owner-only", () => {
    expect(
      canViewerReadPost(
        {
          ownerId: OWNER,
          visibility: "public",
          status: "archived",
          authorDiscoverable: true,
        },
        OTHER,
      ),
    ).toBe(false);
  });
});

describe("canViewerMutatePost", () => {
  it("only the owner may mutate", () => {
    expect(canViewerMutatePost(OWNER, OWNER)).toBe(true);
    expect(canViewerMutatePost(OWNER, OTHER)).toBe(false);
    expect(canViewerMutatePost(OWNER, null)).toBe(false);
  });
});

describe("mapCommunityPost author projection", () => {
  it("redacts non-discoverable author identity for other viewers", () => {
    const mapped = mapCommunityPost(
      row({
        profiles: {
          id: OWNER,
          display_name: "Secret Sam",
          avatar_url: "https://example.com/a.png",
          city: "Hidden City",
          neighborhood: "Secret",
          discoverable: false,
        },
      }),
      OTHER,
    );
    expect(mapped.author?.displayName).toBe("Community member");
    expect(mapped.author?.city).toBeNull();
    expect(mapped.author?.avatarUrl).toBeNull();
    expect(JSON.stringify(mapped)).not.toContain("Secret Sam");
    expect(JSON.stringify(mapped)).not.toContain("discovery");
  });

  it("owners see their own author fields and isOwner flag", () => {
    const mapped = mapCommunityPost(row(), OWNER);
    expect(mapped.isOwner).toBe(true);
    expect(mapped.author?.displayName).toBe("Alex");
    expect(mapped.author?.city).toBe("SF");
  });

  it("never exposes lat/lng fields", () => {
    const mapped = mapCommunityPost(row(), OTHER);
    expect(JSON.stringify(mapped)).not.toMatch(/lat|lng|latitude|longitude/i);
  });
});
