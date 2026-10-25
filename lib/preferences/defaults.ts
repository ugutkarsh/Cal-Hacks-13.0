import type { UserPreferences } from "@/types/preferences";

/** Labeled SF demo starting point — not the user's live GPS. */
export const DEMO_STARTING_POINT = {
  lat: 37.7749,
  lng: -122.4194,
  label: "Demo pin · Downtown SF (not live GPS)",
} as const;

export function createDefaultPreferences(): UserPreferences {
  return {
    maxBudgetCents: 2500,
    maxDistanceKm: 25,
    availableDays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    timeWindow: { startHour: 0, endHour: 23 },
    preferredCategories: ["hiking", "running", "cycling", "outdoor", "sports"],
    skillPreference: "any",
    startingPoint: {
      lat: DEMO_STARTING_POINT.lat,
      lng: DEMO_STARTING_POINT.lng,
    },
    startingPointLabel: DEMO_STARTING_POINT.label,
    locationSource: "demo",
  };
}
