import { describe, expect, it } from "vitest";
import {
  isDuplicateInterestError,
  parseReplyCreate,
  REPLY_BODY_MAX,
} from "@/lib/community/interaction-validation";
import {
  canViewerDeleteReply,
  canViewerInteractWithPost,
  canViewerListInterestedUsers,
  canViewerWithdrawInterest,
} from "@/lib/community/visibility";
import { mapInterest, mapReply } from "@/lib/community/interaction-mappers";
import type {
  DbCommunityPostInterestWithUser,
  DbCommunityPostReplyWithAuthor,
} from "@/types/database";

const OWNER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const THIRD = "cccccccc-cccc-cccc-cccc-cccccccccccc";

describe("parseReplyCreate", () => {
  it("accepts a trimmed body and ignores forged identity fields", () => {
    const parsed = parseReplyCreate({
      body: "  I'm in!  ",
      authorId: OTHER,
      userId: OTHER,
      postId: OTHER,
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.body).toBe("I'm in!");
    expect(
      Object.prototype.hasOwnProperty.call(parsed.value, "authorId"),
    ).toBe(false);
  });

  it("rejects empty or oversized replies", () => {
    expect(parseReplyCreate({ body: "   " }).ok).toBe(false);
    expect(
      parseReplyCreate({ body: "x".repeat(REPLY_BODY_MAX + 1) }).ok,
    ).toBe(false);
    expect(parseReplyCreate({}).ok).toBe(false);
  });
});

describe("isDuplicateInterestError", () => {
  it("detects unique constraint failures", () => {
    expect(
      isDuplicateInterestError(
        'duplicate key value violates unique constraint "community_post_interests_unique"',
      ),
    ).toBe(true);
    expect(isDuplicateInterestError("permission denied")).toBe(false);
  });
});

describe("interaction visibility / ownership", () => {
  const openPublic = {
    ownerId: OWNER,
    visibility: "public" as const,
    status: "open" as const,
    authorDiscoverable: true,
  };

  it("blocks interest/replies on private, closed, or archived posts", () => {
    expect(canViewerInteractWithPost(openPublic, OTHER)).toBe(true);
    expect(
      canViewerInteractWithPost(
        { ...openPublic, visibility: "private" },
        OTHER,
      ),
    ).toBe(false);
    expect(
      canViewerInteractWithPost({ ...openPublic, status: "closed" }, OTHER),
    ).toBe(false);
    expect(
      canViewerInteractWithPost({ ...openPublic, status: "archived" }, OTHER),
    ).toBe(false);
    expect(canViewerInteractWithPost(openPublic, null)).toBe(false);
  });

  it("only the post owner may list interested users", () => {
    expect(canViewerListInterestedUsers(OWNER, OWNER)).toBe(true);
    expect(canViewerListInterestedUsers(OWNER, OTHER)).toBe(false);
    expect(canViewerListInterestedUsers(OWNER, null)).toBe(false);
  });

  it("only the interest owner may withdraw", () => {
    expect(canViewerWithdrawInterest(OTHER, OTHER)).toBe(true);
    expect(canViewerWithdrawInterest(OTHER, OWNER)).toBe(false);
  });

  it("only the reply author may delete", () => {
    expect(canViewerDeleteReply(OTHER, OTHER)).toBe(true);
    expect(canViewerDeleteReply(OTHER, OWNER)).toBe(false);
    expect(canViewerDeleteReply(OTHER, THIRD)).toBe(false);
  });
});

describe("interest / reply privacy mapping", () => {
  it("redacts non-discoverable interested users for the owner view", () => {
    const row: DbCommunityPostInterestWithUser = {
      id: "11111111-1111-1111-1111-111111111111",
      post_id: "22222222-2222-2222-2222-222222222222",
      user_id: OTHER,
      created_at: "2026-10-24T12:00:00.000Z",
      profiles: {
        id: OTHER,
        display_name: "Hidden Pat",
        avatar_url: null,
        city: "Secret City",
        neighborhood: null,
        discoverable: false,
      },
    };
    const mapped = mapInterest(row, OWNER);
    expect(mapped.user?.displayName).toBe("Community member");
    expect(mapped.user?.city).toBeNull();
    expect(JSON.stringify(mapped)).not.toContain("Hidden Pat");
  });

  it("marks reply ownership for the author only", () => {
    const row: DbCommunityPostReplyWithAuthor = {
      id: "11111111-1111-1111-1111-111111111111",
      post_id: "22222222-2222-2222-2222-222222222222",
      author_id: OTHER,
      body: "Count me in",
      created_at: "2026-10-24T12:00:00.000Z",
      updated_at: "2026-10-24T12:00:00.000Z",
      profiles: {
        id: OTHER,
        display_name: "Pat",
        avatar_url: null,
        city: "Oakland",
        neighborhood: null,
        discoverable: true,
      },
    };
    expect(mapReply(row, OTHER).isOwner).toBe(true);
    expect(mapReply(row, OWNER).isOwner).toBe(false);
    expect(mapReply(row, OWNER).author?.displayName).toBe("Pat");
  });
});
