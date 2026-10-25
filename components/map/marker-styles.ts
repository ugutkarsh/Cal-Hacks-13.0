import type { ComponentType } from "react";
import {
  Bike,
  Calendar,
  Dumbbell,
  MapPin,
  Mountain,
  PersonStanding,
  Trees,
  UserRound,
  Users,
  type LucideProps,
} from "lucide-react";
import type { ActivityCategory, EntityKind } from "@/types/map-entities";

export type MarkerIcon = ComponentType<LucideProps>;

export const MARKER_META: Record<
  EntityKind,
  { label: string; cssVar: string; softVar: string }
> = {
  place: {
    label: "Place",
    cssVar: "--marker-place",
    softVar: "--marker-place-soft",
  },
  event: {
    label: "Event",
    cssVar: "--marker-event",
    softVar: "--marker-event-soft",
  },
  person: {
    label: "Person",
    cssVar: "--marker-person",
    softVar: "--marker-person-soft",
  },
};

/** Sticker icons for event categories — colors stay orange via kind. */
const EVENT_CATEGORY_ICONS: Record<ActivityCategory, MarkerIcon> = {
  hiking: Mountain,
  cycling: Bike,
  running: PersonStanding,
  outdoor: Trees,
  sports: Dumbbell,
  meetup: Users,
  climbing: Mountain,
  other: Calendar,
};

export function markerIconFor(
  kind: EntityKind,
  category?: ActivityCategory,
): MarkerIcon {
  if (kind === "place") return MapPin;
  if (kind === "person") return UserRound;
  if (category && EVENT_CATEGORY_ICONS[category]) {
    return EVENT_CATEGORY_ICONS[category];
  }
  return Calendar;
}

export function markerAriaKind(
  kind: EntityKind,
  category?: ActivityCategory,
): string {
  if (kind !== "event" || !category) return MARKER_META[kind].label;
  const labels: Record<ActivityCategory, string> = {
    hiking: "Hike",
    cycling: "Cycling",
    running: "Running",
    outdoor: "Outdoor",
    sports: "Sports",
    meetup: "Meetup",
    climbing: "Climbing",
    other: "Event",
  };
  return labels[category] ?? "Event";
}

export function markerColor(kind: EntityKind): string {
  return `var(${MARKER_META[kind].cssVar})`;
}

/** Compact legend chips for event stickers (color still event orange). */
export const EVENT_STICKER_LEGEND: {
  category: ActivityCategory;
  label: string;
  Icon: MarkerIcon;
}[] = [
  { category: "hiking", label: "Hike", Icon: Mountain },
  { category: "sports", label: "Sports", Icon: Dumbbell },
  { category: "cycling", label: "Bike", Icon: Bike },
  { category: "running", label: "Run", Icon: PersonStanding },
  { category: "outdoor", label: "Outdoor", Icon: Trees },
];
