/**
 * Interest + reply domain types for community posts.
 * No precise lat/lng.
 */

import type { PostAuthorPublic } from "@/types/community-post";

export type CommunityPostInterest = {
  id: string;
  postId: string;
  userId: string;
  createdAt: string;
  /** Present for post owner; privacy-redacted when profile not discoverable. */
  user: PostAuthorPublic | null;
};

export type CommunityPostReply = {
  id: string;
  postId: string;
  authorId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  isOwner: boolean;
  author: PostAuthorPublic | null;
};

export type PostInteractionSummary = {
  interestCount: number;
  replyCount: number;
  viewerInterested: boolean;
};

export type ReplyCreateInput = {
  body: string;
};
