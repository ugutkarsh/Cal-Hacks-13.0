/**
 * Community post domain types — owner vs public projections.
 * Never carries precise lat/lng.
 */

import type { DayOfWeek, SkillPreference } from "@/types/preferences";
import type { ActivityCategory } from "@/types/map-entities";

export type PostIntent =
  | "find_teammates"
  | "find_venue"
  | "join_activity"
  | "organize_meetup";

export type PostVisibility = "public" | "author_discoverable" | "private";

export type PostStatus = "open" | "closed" | "archived";

/** Safe author snippet attached to a post (no private coords / dm policy). */
export type PostAuthorPublic = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  city: string | null;
  neighborhood: string | null;
  discoverable: boolean;
};

export type CommunityPost = {
  id: string;
  ownerId: string;
  message: string;
  activity: string | null;
  category: ActivityCategory | null;
  city: string | null;
  neighborhood: string | null;
  preferredDays: DayOfWeek[];
  timeStartHour: number | null;
  timeEndHour: number | null;
  intent: PostIntent;
  skillLevel: SkillPreference | null;
  /** Author-stated budget in USD cents; null when not set. */
  budgetCents: number | null;
  radiusKm: number | null;
  visibility: PostVisibility;
  status: PostStatus;
  createdAt: string;
  updatedAt: string;
  /** True when the authenticated viewer owns this post. */
  isOwner: boolean;
  author: PostAuthorPublic | null;
  /** Real counts when loaded with interaction summary; else omitted. */
  interestCount?: number;
  replyCount?: number;
  viewerInterested?: boolean;
};

export type CommunityPostCreateInput = {
  message: string;
  activity?: string | null;
  category?: ActivityCategory | null;
  city?: string | null;
  neighborhood?: string | null;
  preferredDays?: DayOfWeek[];
  timeStartHour?: number | null;
  timeEndHour?: number | null;
  intent?: PostIntent;
  skillLevel?: SkillPreference | null;
  budgetCents?: number | null;
  radiusKm?: number | null;
  visibility?: PostVisibility;
  status?: PostStatus;
};

export type CommunityPostUpdateInput = Partial<CommunityPostCreateInput>;

export type CommunityPostListQuery = {
  activity?: string;
  city?: string;
  neighborhood?: string;
  category?: ActivityCategory;
  /** Overlap filter: post must include at least one of these days. */
  days?: DayOfWeek[];
  intent?: PostIntent;
  status?: PostStatus;
  /** When true, only posts owned by the current user. */
  mine?: boolean;
  /** Page size (clamped server-side). */
  limit?: number;
  /** Cursor: ISO created_at of the last item from previous page. */
  cursorCreatedAt?: string;
  /** Cursor: id of the last item (tie-break with created_at). */
  cursorId?: string;
};

export type CommunityPostListResult = {
  posts: CommunityPost[];
  nextCursor: { createdAt: string; id: string } | null;
  limit: number;
};
