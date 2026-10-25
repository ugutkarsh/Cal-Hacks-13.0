/**
 * Pure list-filter + cursor helpers for community posts (unit-tested).
 * Server applies the same predicates via Supabase filters.
 */

import type {
  CommunityPost,
  CommunityPostListQuery,
} from "@/types/community-post";
import { clampPostListLimit } from "@/lib/community/validation";
import type { DayOfWeek } from "@/types/preferences";

export type ParsedListQuery = {
  activity: string | null;
  city: string | null;
  neighborhood: string | null;
  category: string | null;
  days: DayOfWeek[];
  intent: string | null;
  status: string;
  mine: boolean;
  limit: number;
  cursorCreatedAt: string | null;
  cursorId: string | null;
};

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t || null;
}

/** Parse URL search params / plain object into a clamped list query. */
export function parsePostListQuery(
  raw: URLSearchParams | Record<string, string | string[] | undefined>,
): ParsedListQuery {
  const get = (key: string): string | null => {
    if (raw instanceof URLSearchParams) {
      return asString(raw.get(key) ?? undefined);
    }
    const v = raw[key];
    if (Array.isArray(v)) return asString(v[0]);
    return asString(v);
  };

  const daysRaw = get("days");
  const days: DayOfWeek[] = [];
  if (daysRaw) {
    for (const part of daysRaw.split(",")) {
      const d = part.trim().toLowerCase();
      if (
        (["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as string[]).includes(
          d,
        ) &&
        !days.includes(d as DayOfWeek)
      ) {
        days.push(d as DayOfWeek);
      }
    }
  }

  const status = get("status") ?? "open";
  const mine = get("mine") === "1" || get("mine") === "true";

  return {
    activity: get("activity"),
    city: get("city"),
    neighborhood: get("neighborhood"),
    category: get("category"),
    days,
    intent: get("intent"),
    status,
    mine,
    limit: clampPostListLimit(get("limit")),
    cursorCreatedAt: get("cursorCreatedAt") ?? get("cursor_created_at"),
    cursorId: get("cursorId") ?? get("cursor_id"),
  };
}

/**
 * In-memory filter used by tests (mirrors server predicates).
 * Does not re-check RLS — assume input is already visibility-filtered.
 */
export function filterPostsForQuery(
  posts: CommunityPost[],
  query: CommunityPostListQuery & { viewerId?: string | null },
): CommunityPost[] {
  const activity = query.activity?.trim().toLowerCase() ?? null;
  const city = query.city?.trim().toLowerCase() ?? null;
  const neighborhood = query.neighborhood?.trim().toLowerCase() ?? null;
  const days = query.days ?? [];
  const status = query.status ?? "open";

  return posts.filter((post) => {
    if (query.mine && query.viewerId && post.ownerId !== query.viewerId) {
      return false;
    }
    if (status && post.status !== status) return false;
    if (query.intent && post.intent !== query.intent) return false;
    if (query.category && post.category !== query.category) return false;
    if (activity) {
      const hay = (post.activity ?? "").toLowerCase();
      if (!hay.includes(activity)) return false;
    }
    if (city) {
      const hay = (post.city ?? "").toLowerCase();
      if (!hay.includes(city)) return false;
    }
    if (neighborhood) {
      const hay = (post.neighborhood ?? "").toLowerCase();
      if (!hay.includes(neighborhood)) return false;
    }
    if (days.length > 0) {
      const overlap = days.some((d) => post.preferredDays.includes(d));
      if (!overlap) return false;
    }
    return true;
  });
}

/**
 * Apply keyset pagination after filters (created_at desc, id desc).
 * Returns page + next cursor when more remain.
 */
export function paginatePosts(
  posts: CommunityPost[],
  options: {
    limit: number;
    cursorCreatedAt?: string | null;
    cursorId?: string | null;
  },
): {
  posts: CommunityPost[];
  nextCursor: { createdAt: string; id: string } | null;
} {
  const limit = clampPostListLimit(options.limit);
  const sorted = [...posts].sort((a, b) => {
    if (a.createdAt !== b.createdAt) {
      return a.createdAt < b.createdAt ? 1 : -1;
    }
    return a.id < b.id ? 1 : -1;
  });

  let start = 0;
  if (options.cursorCreatedAt && options.cursorId) {
    const idx = sorted.findIndex(
      (p) =>
        p.createdAt === options.cursorCreatedAt && p.id === options.cursorId,
    );
    start = idx >= 0 ? idx + 1 : 0;
    // Also support "strictly older than" without requiring the cursor row present.
    if (idx < 0) {
      start = sorted.findIndex(
        (p) =>
          p.createdAt < options.cursorCreatedAt! ||
          (p.createdAt === options.cursorCreatedAt &&
            p.id < options.cursorId!),
      );
      if (start < 0) start = sorted.length;
    }
  }

  const slice = sorted.slice(start, start + limit);
  const hasMore = start + limit < sorted.length;
  const last = slice[slice.length - 1];
  return {
    posts: slice,
    nextCursor:
      hasMore && last
        ? { createdAt: last.createdAt, id: last.id }
        : null,
  };
}
