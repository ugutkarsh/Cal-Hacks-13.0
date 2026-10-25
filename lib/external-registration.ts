/**
 * External listing registration (Luma / Meetup / Eventbrite).
 * Trailmap cannot see host-site RSVPs. Users confirm after registering there;
 * we store that confirmation privately in this browser (local-demo).
 */

import {
  GUEST_STORAGE_OWNER,
  type StorageOwnerId,
} from "@/lib/privacy/session-storage";

const STORAGE_PREFIX = "trailmap.external-registration.v1";

function storageKey(ownerId: StorageOwnerId): string {
  const owner = ownerId?.trim() || GUEST_STORAGE_OWNER;
  return `${STORAGE_PREFIX}:${owner}`;
}

function getLocalStorage(): Storage | null {
  try {
    if (typeof globalThis === "undefined") return null;
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    return ls ?? null;
  } catch {
    return null;
  }
}

function readIds(ownerId: StorageOwnerId): Set<string> {
  const ls = getLocalStorage();
  if (!ls) return new Set();
  try {
    const raw = ls.getItem(storageKey(ownerId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed.filter((id): id is string => typeof id === "string" && id.length > 0),
    );
  } catch {
    return new Set();
  }
}

function writeIds(ownerId: StorageOwnerId, ids: Set<string>): void {
  const ls = getLocalStorage();
  if (!ls) return;
  ls.setItem(storageKey(ownerId), JSON.stringify([...ids]));
}

export function isExternallyRegistered(
  activityId: string,
  ownerId: StorageOwnerId = null,
): boolean {
  if (!activityId) return false;
  return readIds(ownerId).has(activityId);
}

/** User confirms they finished registration on the host listing. */
export function confirmExternalRegistration(
  activityId: string,
  ownerId: StorageOwnerId = null,
): void {
  if (!activityId) return;
  const ids = readIds(ownerId);
  ids.add(activityId);
  writeIds(ownerId, ids);
}

export function clearExternalRegistration(
  activityId: string,
  ownerId: StorageOwnerId = null,
): void {
  if (!activityId) return;
  const ids = readIds(ownerId);
  ids.delete(activityId);
  writeIds(ownerId, ids);
}
