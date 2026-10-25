"use client";

import type { CSSProperties } from "react";
import {
  MARKER_META,
  markerAriaKind,
  markerIconFor,
} from "@/components/map/marker-styles";
import { cn } from "@/lib/utils";
import type { RelevanceTier } from "@/lib/map/discovery-visibility";
import type { ActivityCategory, EntityKind } from "@/types/map-entities";

interface MapMarkerButtonProps {
  kind: EntityKind;
  /** Used for event sticker icons (hike, sports, …). */
  category?: ActivityCategory;
  name: string;
  selected?: boolean;
  /** Highlight as a personalized recommendation (not ML). */
  recommended?: boolean;
  /** Relevance band when personalization is on — visual only. */
  relevance?: RelevanceTier;
  /** Emphasize when the matching activity card is hovered. */
  emphasized?: boolean;
  onSelect: () => void;
  className?: string;
  style?: CSSProperties;
}

function zForState(
  selected: boolean,
  emphasized: boolean,
  relevance: RelevanceTier,
): number {
  if (selected) return 40;
  if (emphasized) return 30;
  if (relevance === "high") return 20;
  if (relevance === "medium") return 15;
  return 10;
}

export function MapMarkerButton({
  kind,
  category,
  name,
  selected = false,
  recommended = false,
  relevance = "none",
  emphasized = false,
  onSelect,
  className,
  style,
}: MapMarkerButtonProps) {
  const meta = MARKER_META[kind];
  const Icon = markerIconFor(kind, category);
  const kindLabel = markerAriaKind(kind, category);
  const tierNote =
    relevance === "high"
      ? " (strong match)"
      : relevance === "medium"
        ? " (good match)"
        : recommended
          ? " (recommended for you)"
          : "";

  return (
    <button
      type="button"
      aria-label={`${kindLabel}: ${name}${tierNote}`}
      aria-pressed={selected}
      data-selected={selected ? "true" : "false"}
      data-recommended={recommended || relevance !== "none" ? "true" : "false"}
      data-relevance={relevance}
      data-emphasized={emphasized ? "true" : "false"}
      onClick={onSelect}
      className={cn(
        "discovery-pin group relative flex h-8 w-8 items-center justify-center rounded-full border-[1.5px] border-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-1",
        className,
      )}
      style={
        {
          backgroundColor: `var(${meta.cssVar})`,
          ["--pin-accent" as string]: `var(${meta.cssVar})`,
          zIndex: zForState(selected, emphasized, relevance),
          ...style,
        } as CSSProperties
      }
    >
      <Icon className="h-3.5 w-3.5 text-white" strokeWidth={2.25} aria-hidden />
      <span className="pointer-events-none absolute -bottom-7 left-1/2 z-30 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-[var(--brand-deep)] px-1.5 py-0.5 text-[10px] font-medium text-white shadow-md group-hover:block group-focus-visible:block">
        {name}
      </span>
    </button>
  );
}
