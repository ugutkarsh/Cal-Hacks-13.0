/**
 * Profile domain types — private (owner) vs public (discoverable) projections.
 */

import type { DayOfWeek, SkillPreference } from "@/types/preferences";

export type DmPolicy = "everyone" | "discoverable_only" | "nobody";

/** How much place context others may see. */
export type LocationShareLevel = "hidden" | "city_only" | "approximate";

/** Full profile visible only to the authenticated owner. */
export type OwnProfile = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  city: string | null;
  neighborhood: string | null;
  interests: string[];
  skillLevel: SkillPreference | null;
  availabilityDays: DayOfWeek[];
  availabilityStartHour: number | null;
  availabilityEndHour: number | null;
  preferredRadiusKm: number | null;
  discoverable: boolean;
  /** Approximate discovery pin — never treated as live GPS. */
  discoveryLat: number | null;
  discoveryLng: number | null;
  locationShareLevel: LocationShareLevel;
  dmPolicy: DmPolicy;
  createdAt: string;
  updatedAt: string;
};

/**
 * Fields other users may see when discoverable=true.
 * Omits dm_policy detail and uses fuzzed coordinates only when share level allows.
 */
export type PublicProfile = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  city: string | null;
  neighborhood: string | null;
  interests: string[];
  skillLevel: SkillPreference | null;
  availabilityDays: DayOfWeek[];
  availabilityStartHour: number | null;
  availabilityEndHour: number | null;
  preferredRadiusKm: number | null;
  /** Fuzzed approximate pin only; null for city_only. */
  discoveryLat: number | null;
  discoveryLng: number | null;
  locationShareLevel: LocationShareLevel;
  /** Whether the person allows DMs at all (not the full policy enum). */
  acceptsMessages: boolean;
  presenceNote: string;
};

export type ProfileUpdateInput = {
  displayName?: string;
  avatarUrl?: string | null;
  bio?: string | null;
  city?: string | null;
  neighborhood?: string | null;
  interests?: string[];
  skillLevel?: SkillPreference | null;
  availabilityDays?: DayOfWeek[];
  availabilityStartHour?: number | null;
  availabilityEndHour?: number | null;
  preferredRadiusKm?: number | null;
  discoverable?: boolean;
  discoveryLat?: number | null;
  discoveryLng?: number | null;
  locationShareLevel?: LocationShareLevel;
  dmPolicy?: DmPolicy;
};

export type ReportTargetType = "profile" | "post" | "reply" | "message";
export type ReportReason =
  | "spam"
  | "harassment"
  | "inappropriate"
  | "impersonation"
  | "safety"
  | "other";
