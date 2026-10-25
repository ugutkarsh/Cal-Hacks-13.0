"use client";

import { createDefaultPreferences } from "@/lib/preferences/defaults";
import {
  GUEST_STORAGE_OWNER,
  preferencesStorageKey,
  type StorageOwnerId,
} from "@/lib/privacy/session-storage";
import {
  PREFERENCES_STORAGE_KEY,
  PREFERENCES_STORAGE_MODE,
  type UserPreferences,
} from "@/types/preferences";

export type PreferencesLoadResult = {
  preferences: UserPreferences;
  storage: typeof PREFERENCES_STORAGE_MODE;
  fromStorage: boolean;
  ownerId: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parsePreferences(raw: unknown): UserPreferences | null {
  if (!isRecord(raw)) return null;
  const defaults = createDefaultPreferences();
  try {
    return {
      maxBudgetCents:
        raw.maxBudgetCents === null
          ? null
          : typeof raw.maxBudgetCents === "number"
            ? raw.maxBudgetCents
            : defaults.maxBudgetCents,
      maxDistanceKm:
        typeof raw.maxDistanceKm === "number"
          ? raw.maxDistanceKm
          : defaults.maxDistanceKm,
      availableDays: Array.isArray(raw.availableDays)
        ? (raw.availableDays as UserPreferences["availableDays"])
        : defaults.availableDays,
      timeWindow:
        isRecord(raw.timeWindow) &&
        typeof raw.timeWindow.startHour === "number" &&
        typeof raw.timeWindow.endHour === "number"
          ? {
              startHour: raw.timeWindow.startHour,
              endHour: raw.timeWindow.endHour,
            }
          : defaults.timeWindow,
      preferredCategories: Array.isArray(raw.preferredCategories)
        ? (raw.preferredCategories as UserPreferences["preferredCategories"])
        : defaults.preferredCategories,
      skillPreference:
        typeof raw.skillPreference === "string"
          ? (raw.skillPreference as UserPreferences["skillPreference"])
          : defaults.skillPreference,
      startingPoint:
        isRecord(raw.startingPoint) &&
        typeof raw.startingPoint.lat === "number" &&
        typeof raw.startingPoint.lng === "number"
          ? {
              lat: raw.startingPoint.lat,
              lng: raw.startingPoint.lng,
            }
          : defaults.startingPoint,
      startingPointLabel:
        typeof raw.startingPointLabel === "string"
          ? raw.startingPointLabel
          : defaults.startingPointLabel,
      locationSource:
        raw.locationSource === "manual" ||
        raw.locationSource === "demo" ||
        raw.locationSource === "browser"
          ? raw.locationSource
          : defaults.locationSource,
    };
  } catch {
    return null;
  }
}

function readRaw(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Load preferences private to this person (auth user id) or guest browser bucket.
 * Never shares another account's prefs. Legacy unscoped key migrates into guest once.
 */
export function loadPreferences(
  ownerId: StorageOwnerId = null,
): PreferencesLoadResult {
  const owner = ownerId?.trim() || GUEST_STORAGE_OWNER;
  const key = preferencesStorageKey(ownerId);

  if (typeof window === "undefined") {
    return {
      preferences: createDefaultPreferences(),
      storage: PREFERENCES_STORAGE_MODE,
      fromStorage: false,
      ownerId: owner,
    };
  }

  try {
    let raw = readRaw(key);
    // One-time migrate old shared key → guest only (not into a signed-in account).
    if (!raw && owner === GUEST_STORAGE_OWNER) {
      raw = readRaw(PREFERENCES_STORAGE_KEY);
      if (raw) {
        window.localStorage.setItem(key, raw);
        window.localStorage.removeItem(PREFERENCES_STORAGE_KEY);
      }
    }

    if (!raw) {
      return {
        preferences: createDefaultPreferences(),
        storage: PREFERENCES_STORAGE_MODE,
        fromStorage: false,
        ownerId: owner,
      };
    }
    const parsed = parsePreferences(JSON.parse(raw));
    if (!parsed) {
      return {
        preferences: createDefaultPreferences(),
        storage: PREFERENCES_STORAGE_MODE,
        fromStorage: false,
        ownerId: owner,
      };
    }
    return {
      preferences: parsed,
      storage: PREFERENCES_STORAGE_MODE,
      fromStorage: true,
      ownerId: owner,
    };
  } catch {
    return {
      preferences: createDefaultPreferences(),
      storage: PREFERENCES_STORAGE_MODE,
      fromStorage: false,
      ownerId: owner,
    };
  }
}

export function savePreferences(
  preferences: UserPreferences,
  ownerId: StorageOwnerId = null,
): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    preferencesStorageKey(ownerId),
    JSON.stringify(preferences),
  );
}
