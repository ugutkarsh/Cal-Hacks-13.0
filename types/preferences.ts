import type { ActivityCategory, GeoPoint } from "@/types/map-entities";

export type DayOfWeek =
  | "mon"
  | "tue"
  | "wed"
  | "thu"
  | "fri"
  | "sat"
  | "sun";

export type SkillPreference = "beginner" | "intermediate" | "advanced" | "any";

export type TimeWindow = {
  startHour: number; // 0–23 local
  endHour: number; // 0–23 local, exclusive upper bound if equal treated as overnight-open
};

export type LocationSource = "manual" | "demo" | "browser";

export interface UserPreferences {
  maxBudgetCents: number | null;
  maxDistanceKm: number;
  availableDays: DayOfWeek[];
  timeWindow: TimeWindow;
  preferredCategories: ActivityCategory[];
  skillPreference: SkillPreference;
  startingPoint: GeoPoint | null;
  startingPointLabel: string;
  locationSource: LocationSource | null;
}

export const PREFERENCES_STORAGE_KEY = "trailmap.preferences.v1";
export const PREFERENCES_STORAGE_MODE = "local-demo" as const;
