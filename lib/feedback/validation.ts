/**
 * Validate feedback write payloads. Never invent ratings or forge user ids.
 */

import {
  FEEDBACK_ACTIONS,
  type FeedbackAction,
  type FeedbackEvent,
} from "@/types/feedback";
import type { ActivityCategory } from "@/types/map-entities";

const CATEGORIES: ActivityCategory[] = [
  "hiking",
  "cycling",
  "running",
  "outdoor",
  "meetup",
  "climbing",
  "sports",
  "other",
];

export type FeedbackCreateInput = {
  activityId: string;
  action: FeedbackAction;
  rating?: number | null;
  activityCategory?: string | null;
};

export type FeedbackValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export function isFeedbackAction(v: unknown): v is FeedbackAction {
  return typeof v === "string" && (FEEDBACK_ACTIONS as string[]).includes(v);
}

export function parseFeedbackCreate(
  body: unknown,
): FeedbackValidationResult<FeedbackCreateInput> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid feedback payload" };
  }
  const raw = body as Record<string, unknown>;

  if (typeof raw.activityId !== "string" || !raw.activityId.trim()) {
    return { ok: false, error: "activityId is required" };
  }
  const activityId = raw.activityId.trim();
  if (activityId.length > 128) {
    return { ok: false, error: "activityId must be ≤ 128 characters" };
  }

  if (!isFeedbackAction(raw.action)) {
    return { ok: false, error: "Invalid feedback action" };
  }
  const action = raw.action;

  let rating: number | null = null;
  if (action === "rate") {
    if (
      typeof raw.rating !== "number" ||
      !Number.isInteger(raw.rating) ||
      raw.rating < 1 ||
      raw.rating > 5
    ) {
      return { ok: false, error: "rating must be an integer 1–5 for rate" };
    }
    rating = raw.rating;
  } else if (raw.rating != null && raw.rating !== "") {
    return { ok: false, error: "rating is only allowed for rate actions" };
  }

  let activityCategory: string | null = null;
  if (raw.activityCategory != null && raw.activityCategory !== "") {
    if (
      typeof raw.activityCategory !== "string" ||
      !(CATEGORIES as string[]).includes(raw.activityCategory)
    ) {
      return { ok: false, error: "Invalid activityCategory" };
    }
    activityCategory = raw.activityCategory;
  }

  // Ignore forged userId / ownerId
  return {
    ok: true,
    value: { activityId, action, rating, activityCategory },
  };
}

/** Normalize a DB or client row into FeedbackEvent (defensive). */
export function sanitizeFeedbackEvent(raw: unknown): FeedbackEvent | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.activityId !== "string" || !o.activityId.trim()) return null;
  if (!isFeedbackAction(o.action)) return null;
  const storage =
    o.storage === "supabase" || o.storage === "local-demo"
      ? o.storage
      : "local-demo";
  let rating: number | null = null;
  if (o.action === "rate") {
    if (
      typeof o.rating !== "number" ||
      !Number.isInteger(o.rating) ||
      o.rating < 1 ||
      o.rating > 5
    ) {
      return null;
    }
    rating = o.rating;
  }
  return {
    id: typeof o.id === "string" ? o.id : `fb_${Date.now()}`,
    activityId: o.activityId.trim(),
    action: o.action,
    rating,
    activityCategory:
      typeof o.activityCategory === "string" ? o.activityCategory : null,
    createdAt:
      typeof o.createdAt === "string"
        ? o.createdAt
        : new Date().toISOString(),
    storage,
  };
}

export function sanitizeFeedbackList(raw: unknown): FeedbackEvent[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(sanitizeFeedbackEvent)
    .filter((e): e is FeedbackEvent => e != null);
}
