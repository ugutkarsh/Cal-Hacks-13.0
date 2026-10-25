import { describe, expect, it } from "vitest";
import {
  filterPostsForQuery,
  paginatePosts,
  parsePostListQuery,
} from "@/lib/community/query";
import type { CommunityPost } from "@/types/community-post";

const OWNER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function post(partial: Partial<CommunityPost>): CommunityPost {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    ownerId: OWNER,
    message: "Hello",
    activity: "hiking",
    category: "hiking",
    city: "Oakland",
    neighborhood: "Rockridge",
    preferredDays: ["sat", "sun"],
    timeStartHour: 9,
    timeEndHour: 12,
    intent: "find_teammates",
    skillLevel: "any",
    budgetCents: null,
    radiusKm: 10,
    visibility: "public",
    status: "open",
    createdAt: "2026-10-24T12:00:00.000Z",
    updatedAt: "2026-10-24T12:00:00.000Z",
    isOwner: false,
    author: null,
    ...partial,
  };
}

describe("parsePostListQuery", () => {
  it("parses filters and clamps limit", () => {
    const q = parsePostListQuery(
      new URLSearchParams(
        "activity=hike&city=Oakland&days=sat,sun&limit=999&mine=true",
      ),
    );
    expect(q.activity).toBe("hike");
    expect(q.city).toBe("Oakland");
    expect(q.days).toEqual(["sat", "sun"]);
    expect(q.limit).toBe(50);
    expect(q.mine).toBe(true);
  });
});

describe("filterPostsForQuery", () => {
  const catalog = [
    post({
      id: "a",
      activity: "hiking",
      city: "Oakland",
      preferredDays: ["sat"],
      ownerId: OWNER,
    }),
    post({
      id: "b",
      activity: "pickleball",
      city: "Berkeley",
      category: "sports",
      preferredDays: ["wed"],
      ownerId: OTHER,
      intent: "join_activity",
    }),
    post({
      id: "c",
      activity: "hiking",
      city: "Oakland",
      status: "closed",
      preferredDays: ["sun"],
      ownerId: OWNER,
    }),
  ];

  it("filters by activity and city", () => {
    const out = filterPostsForQuery(catalog, {
      activity: "hik",
      city: "oak",
      status: "open",
    });
    expect(out.map((p) => p.id)).toEqual(["a"]);
  });

  it("filters by overlapping preferred days", () => {
    const out = filterPostsForQuery(catalog, {
      days: ["wed"],
      status: "open",
    });
    expect(out.map((p) => p.id)).toEqual(["b"]);
  });

  it("supports mine filter with viewerId", () => {
    const out = filterPostsForQuery(catalog, {
      mine: true,
      viewerId: OWNER,
      status: "open",
    });
    expect(out.map((p) => p.id)).toEqual(["a"]);
  });
});

describe("paginatePosts", () => {
  it("returns a bounded page and next cursor", () => {
    const posts = [
      post({ id: "3", createdAt: "2026-10-24T15:00:00.000Z" }),
      post({ id: "2", createdAt: "2026-10-24T14:00:00.000Z" }),
      post({ id: "1", createdAt: "2026-10-24T13:00:00.000Z" }),
    ];
    const page1 = paginatePosts(posts, { limit: 2 });
    expect(page1.posts.map((p) => p.id)).toEqual(["3", "2"]);
    expect(page1.nextCursor).toEqual({
      createdAt: "2026-10-24T14:00:00.000Z",
      id: "2",
    });

    const page2 = paginatePosts(posts, {
      limit: 2,
      cursorCreatedAt: page1.nextCursor!.createdAt,
      cursorId: page1.nextCursor!.id,
    });
    expect(page2.posts.map((p) => p.id)).toEqual(["1"]);
    expect(page2.nextCursor).toBeNull();
  });
});
