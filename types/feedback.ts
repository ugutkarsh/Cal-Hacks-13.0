/**
 * Activity recommendation feedback — privacy-conscious personalization signals.
 * Rules-based score adjustments only (not a trained ML model).
 */

export type FeedbackAction = "save" | "like" | "join" | "skip" | "rate";

export type FeedbackStorage = "local-demo" | "supabase";

export interface FeedbackEvent {
  id: string;
  activityId: string;
  action: FeedbackAction;
  /** 1–5 when action is rate; otherwise null */
  rating: number | null;
  /** Catalog category at feedback time — for similar-activity boosts only. */
  activityCategory?: string | null;
  createdAt: string;
  storage: FeedbackStorage;
}

export const FEEDBACK_STORAGE_KEY = "trailmap.feedback.v1";

export const FEEDBACK_ACTIONS: FeedbackAction[] = [
  "save",
  "like",
  "join",
  "skip",
  "rate",
];
