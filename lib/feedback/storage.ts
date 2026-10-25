"use client";

import {
  feedbackStorageKey,
  GUEST_STORAGE_OWNER,
  type StorageOwnerId,
} from "@/lib/privacy/session-storage";
import { sanitizeFeedbackList } from "@/lib/feedback/validation";
import {
  FEEDBACK_STORAGE_KEY,
  type FeedbackAction,
  type FeedbackEvent,
} from "@/types/feedback";

function readList(key: string): FeedbackEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    return sanitizeFeedbackList(JSON.parse(raw));
  } catch {
    return [];
  }
}

function writeList(key: string, events: FeedbackEvent[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(events));
}

/** Feedback is private per signed-in user (or guest browser). */
export function loadFeedbackEvents(
  ownerId: StorageOwnerId = null,
): FeedbackEvent[] {
  const key = feedbackStorageKey(ownerId);
  const scoped = readList(key);
  if (scoped.length > 0) return scoped;

  // Migrate legacy shared key into guest only.
  if (!ownerId || ownerId === GUEST_STORAGE_OWNER) {
    const legacy = readList(FEEDBACK_STORAGE_KEY);
    if (legacy.length > 0 && typeof window !== "undefined") {
      writeList(key, legacy);
      window.localStorage.removeItem(FEEDBACK_STORAGE_KEY);
      return legacy;
    }
  }
  return [];
}

export function recordFeedbackEvent(
  input: {
    activityId: string;
    action: FeedbackAction;
    rating?: number | null;
    activityCategory?: string | null;
  },
  ownerId: StorageOwnerId = null,
): FeedbackEvent {
  const event: FeedbackEvent = {
    id: `fb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    activityId: input.activityId,
    action: input.action,
    rating:
      input.action === "rate" && typeof input.rating === "number"
        ? input.rating
        : null,
    activityCategory: input.activityCategory ?? null,
    createdAt: new Date().toISOString(),
    storage: "local-demo",
  };

  if (typeof window === "undefined") return event;

  const existing = loadFeedbackEvents(ownerId);
  const next = [...existing, event];
  writeList(feedbackStorageKey(ownerId), next);
  return event;
}

/** Clear all local personalization feedback for this owner. */
export function clearFeedbackEvents(ownerId: StorageOwnerId = null): void {
  if (typeof window === "undefined") return;
  writeList(feedbackStorageKey(ownerId), []);
  if (!ownerId || ownerId === GUEST_STORAGE_OWNER) {
    window.localStorage.removeItem(FEEDBACK_STORAGE_KEY);
  }
}

/** Replace local cache with server rows (signed-in sync). */
export function replaceFeedbackEvents(
  events: FeedbackEvent[],
  ownerId: StorageOwnerId,
): void {
  if (typeof window === "undefined" || !ownerId) return;
  writeList(feedbackStorageKey(ownerId), sanitizeFeedbackList(events));
}
