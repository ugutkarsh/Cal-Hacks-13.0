/**
 * Map interest / reply DB rows ↔ API shapes.
 * Non-discoverable users are redacted for non-self viewers.
 */

import type {
  CommunityPostInterest,
  CommunityPostReply,
} from "@/types/community-interaction";
import type { PostAuthorPublic } from "@/types/community-post";
import type {
  DbCommunityPostInterestWithUser,
  DbCommunityPostReplyWithAuthor,
  DbProfile,
} from "@/types/database";

type ProfileSnippet = Pick<
  DbProfile,
  | "id"
  | "display_name"
  | "avatar_url"
  | "city"
  | "neighborhood"
  | "discoverable"
> | null;

function normalizeProfile(
  profiles: ProfileSnippet | ProfileSnippet[] | null | undefined,
): ProfileSnippet {
  if (!profiles) return null;
  if (Array.isArray(profiles)) return profiles[0] ?? null;
  return profiles;
}

function mapPerson(
  profiles: ProfileSnippet,
  viewerId: string | null,
  subjectId: string,
): PostAuthorPublic | null {
  if (!profiles) {
    return {
      id: subjectId,
      displayName: "Community member",
      avatarUrl: null,
      city: null,
      neighborhood: null,
      discoverable: false,
    };
  }
  const isSelf = viewerId === subjectId;
  if (!isSelf && !profiles.discoverable) {
    return {
      id: profiles.id,
      displayName: "Community member",
      avatarUrl: null,
      city: null,
      neighborhood: null,
      discoverable: false,
    };
  }
  return {
    id: profiles.id,
    displayName: profiles.display_name,
    avatarUrl: profiles.avatar_url,
    city: profiles.city,
    neighborhood: profiles.neighborhood,
    discoverable: profiles.discoverable,
  };
}

export function mapInterest(
  row: DbCommunityPostInterestWithUser,
  viewerId: string | null,
): CommunityPostInterest {
  return {
    id: row.id,
    postId: row.post_id,
    userId: row.user_id,
    createdAt: row.created_at,
    user: mapPerson(normalizeProfile(row.profiles), viewerId, row.user_id),
  };
}

export function mapReply(
  row: DbCommunityPostReplyWithAuthor,
  viewerId: string | null,
): CommunityPostReply {
  return {
    id: row.id,
    postId: row.post_id,
    authorId: row.author_id,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isOwner: viewerId === row.author_id,
    author: mapPerson(normalizeProfile(row.profiles), viewerId, row.author_id),
  };
}

export const INTEREST_SELECT =
  "id, post_id, user_id, created_at, profiles!user_id(id, display_name, avatar_url, city, neighborhood, discoverable)";

export const REPLY_SELECT =
  "id, post_id, author_id, body, created_at, updated_at, profiles!author_id(id, display_name, avatar_url, city, neighborhood, discoverable)";
