/**
 * Shared post-access checks for interest / reply API routes.
 */

import type { PostVisibilityInput } from "@/lib/community/visibility";
import {
  canViewerInteractWithPost,
  canViewerListInterestedUsers,
  canViewerReadPost,
} from "@/lib/community/visibility";
import type { SupabaseClient, User } from "@supabase/supabase-js";

export type LoadedPostAccess = {
  postId: string;
  ownerId: string;
  visibility: PostVisibilityInput;
};

export async function loadPostAccess(
  supabase: SupabaseClient,
  postId: string,
): Promise<
  | { ok: true; post: LoadedPostAccess }
  | { ok: false; notFound: true }
  | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from("community_posts")
    .select(
      "id, owner_id, visibility, status, profiles!owner_id(discoverable)",
    )
    .eq("id", postId)
    .maybeSingle();

  if (error) {
    if (/community_posts|does not exist|schema cache/i.test(error.message)) {
      return {
        ok: false,
        error:
          "Community posts missing — apply migrations 20261024210000 and 20261024220000",
      };
    }
    return { ok: false, error: error.message };
  }
  if (!data) return { ok: false, notFound: true };

  const profiles = data.profiles as
    | { discoverable?: boolean }
    | { discoverable?: boolean }[]
    | null;
  const discoverable = Array.isArray(profiles)
    ? Boolean(profiles[0]?.discoverable)
    : Boolean(profiles?.discoverable);

  return {
    ok: true,
    post: {
      postId: data.id as string,
      ownerId: data.owner_id as string,
      visibility: {
        ownerId: data.owner_id as string,
        visibility: data.visibility as PostVisibilityInput["visibility"],
        status: data.status as PostVisibilityInput["status"],
        authorDiscoverable: discoverable,
      },
    },
  };
}

export function assertReadable(
  post: LoadedPostAccess,
  user: User | null,
): string | null {
  if (!canViewerReadPost(post.visibility, user?.id ?? null)) {
    return "Post not found";
  }
  return null;
}

export function assertInteractable(
  post: LoadedPostAccess,
  user: User | null,
): string | null {
  if (!user) return "Sign in required";
  if (!canViewerInteractWithPost(post.visibility, user.id)) {
    if (!canViewerReadPost(post.visibility, user.id)) {
      return "Post not found";
    }
    return "This post is not open for new interest or replies";
  }
  return null;
}

export function assertCanListInterests(
  post: LoadedPostAccess,
  user: User | null,
): string | null {
  if (!user) return "Sign in required";
  if (!canViewerListInterestedUsers(post.ownerId, user.id)) {
    return "Only the post owner can view interested users";
  }
  return null;
}
