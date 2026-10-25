/**
 * Per-person private client storage.
 * Search queries must never be written here — only prefs/feedback.
 */

export type StorageOwnerId = string | null;

/** Guest bucket when signed out — still private to this browser, not shared accounts. */
export const GUEST_STORAGE_OWNER = "guest";

export function preferencesStorageKey(ownerId: StorageOwnerId): string {
  const id = ownerId?.trim() || GUEST_STORAGE_OWNER;
  return `trailmap.preferences.v1:user:${id}`;
}

export function feedbackStorageKey(ownerId: StorageOwnerId): string {
  const id = ownerId?.trim() || GUEST_STORAGE_OWNER;
  return `trailmap.feedback.v1:user:${id}`;
}
