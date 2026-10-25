/**
 * Pure visibility / ownership helpers (unit-tested; mirror RLS intent).
 */

import type {
  PostStatus,
  PostVisibility,
} from "@/types/community-post";

export type PostVisibilityInput = {
  ownerId: string;
  visibility: PostVisibility;
  status: PostStatus;
  authorDiscoverable: boolean;
};

/**
 * Whether a viewer may read a post (API-layer mirror of RLS).
 * Archived posts are owner-only.
 */
export function canViewerReadPost(
  post: PostVisibilityInput,
  viewerId: string | null,
): boolean {
  if (viewerId && viewerId === post.ownerId) return true;
  if (post.status === "archived") return false;
  if (post.visibility === "private") return false;
  if (post.visibility === "public") return true;
  // author_discoverable
  return post.authorDiscoverable;
}

/**
 * Interest / new replies only on readable open posts.
 * Private, archived, closed, or unreadable → reject.
 */
export function canViewerInteractWithPost(
  post: PostVisibilityInput,
  viewerId: string | null,
): boolean {
  if (!viewerId) return false;
  if (post.status !== "open") return false;
  return canViewerReadPost(post, viewerId);
}

/** Post owner may list interested users (privacy applied in mappers). */
export function canViewerListInterestedUsers(
  ownerId: string,
  viewerId: string | null,
): boolean {
  return Boolean(viewerId && viewerId === ownerId);
}

/** Only the interest row owner may withdraw. */
export function canViewerWithdrawInterest(
  interestUserId: string,
  viewerId: string | null,
): boolean {
  return Boolean(viewerId && viewerId === interestUserId);
}

/** Only the reply author may delete. */
export function canViewerDeleteReply(
  authorId: string,
  viewerId: string | null,
): boolean {
  return Boolean(viewerId && viewerId === authorId);
}

/** Only the owner may edit or delete. Client-supplied owner ids are irrelevant. */
export function canViewerMutatePost(
  ownerId: string,
  viewerId: string | null,
): boolean {
  return Boolean(viewerId && viewerId === ownerId);
}
