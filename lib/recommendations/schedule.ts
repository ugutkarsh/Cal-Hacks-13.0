import type { DayOfWeek, TimeWindow } from "@/types/preferences";

const DAY_MAP: DayOfWeek[] = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
];

export function dayOfWeekFromIso(iso: string): DayOfWeek | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return DAY_MAP[date.getUTCDay()] ?? null;
}

export function hourFromIso(iso: string): number | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.getUTCHours();
}

/**
 * Schedule fit using UTC day/hour as a deterministic stand-in.
 * Unknown/invalid timestamps return "unknown" (not a verified match).
 */
export function scheduleFit(
  startsAt: string,
  availableDays: DayOfWeek[],
  window: TimeWindow,
): "fit" | "unknown" | "mismatch" {
  const day = dayOfWeekFromIso(startsAt);
  const hour = hourFromIso(startsAt);
  if (day == null || hour == null) return "unknown";

  if (availableDays.length > 0 && !availableDays.includes(day)) {
    return "mismatch";
  }

  const { startHour, endHour } = window;
  if (startHour === endHour) return "fit";
  if (startHour < endHour) {
    return hour >= startHour && hour < endHour ? "fit" : "mismatch";
  }
  // Overnight window
  return hour >= startHour || hour < endHour ? "fit" : "mismatch";
}
