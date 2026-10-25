/**
 * Meetup planner — suggested plans from the real catalog.
 * Never a confirmed booking or verified attendee commitment.
 */

import type { ActivityCategory, EntityKind, GeoPoint } from "@/types/map-entities";
import type { DayOfWeek, SkillPreference } from "@/types/preferences";
import type { RecommendationReason } from "@/types/recommendations";

export type MeetupPlanStatus =
  | "needs_info"
  | "suggested"
  | "empty"
  | "error";

/** Editable planner criteria collected from NL + follow-ups. */
export type MeetupPlanCriteria = {
  activity: string | null;
  category: ActivityCategory | null;
  city: string | null;
  neighborhood: string | null;
  preferredDays: DayOfWeek[];
  timeStartHour: number | null;
  timeEndHour: number | null;
  skillLevel: SkillPreference | null;
  budgetCents: number | null;
  /** Desired group size when stated (e.g. “for four people”). */
  groupSize: number | null;
  vibe: string | null;
};

export type MeetupPlanOptionKind = "venue" | "event";

export type MeetupPlanOption = {
  id: string;
  kind: MeetupPlanOptionKind;
  mapKind: EntityKind;
  name: string;
  summary: string;
  category: ActivityCategory;
  locationLabel: string;
  coordinates: GeoPoint | null;
  sourceUrl: string | null;
  score: number;
  reasons: RecommendationReason[];
  /**
   * Always honest — we do not verify open tables / court booking / RSVP seats.
   */
  availabilityNote: string;
  /** Event-only: capacity from catalog when present; never invented. */
  capacity: number | null;
  attendeeCount: number | null;
  costCents: number | null;
  startsAt: string | null;
};

export type MeetupPlanFollowUp = {
  field: keyof MeetupPlanCriteria | "general";
  question: string;
};

export type MeetupPlan = {
  status: MeetupPlanStatus;
  engine: "deterministic-rules";
  llmConfigured: false;
  limitation: string;
  /** Suggested plan ≠ booking / reservation / confirmed attendees. */
  disclaimer: string;
  originalMessage: string;
  criteria: MeetupPlanCriteria;
  followUps: MeetupPlanFollowUp[];
  options: MeetupPlanOption[];
  /** Primary pick among options (user may change). */
  selectedOptionId: string | null;
  emptyReason: string | null;
  dataSourceLabel: string;
  /** Draft community post message — only published on explicit share. */
  draftShareMessage: string | null;
};

export type MeetupPlanShareResult = {
  ok: true;
  postId: string;
  message: string;
};
