"use client";

import {
  EVENT_STICKER_LEGEND,
  MARKER_META,
} from "@/components/map/marker-styles";
import type { EntityKind } from "@/types/map-entities";

const KINDS: EntityKind[] = ["place", "event", "person"];

export function MapLegend() {
  return (
    <div
      className="pointer-events-none absolute bottom-4 left-4 z-20 max-w-[min(100%-2rem,20rem)] rounded-lg border border-[var(--border)] bg-[var(--surface)]/95 px-3 py-2 shadow-md backdrop-blur"
      aria-label="Map legend"
    >
      <ul className="flex flex-wrap gap-3">
        {KINDS.map((kind) => {
          const meta = MARKER_META[kind];
          return (
            <li key={kind} className="flex items-center gap-1.5 text-xs">
              <span
                className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/80"
                style={{ backgroundColor: `var(${meta.cssVar})` }}
                aria-hidden
              />
              <span className="text-[var(--foreground)]">{meta.label}</span>
            </li>
          );
        })}
      </ul>
      <ul
        className="mt-2 flex flex-wrap gap-2 border-t border-[var(--border)] pt-2"
        aria-label="Event stickers"
      >
        {EVENT_STICKER_LEGEND.map(({ category, label, Icon }) => (
          <li
            key={category}
            className="flex items-center gap-1 text-[10px] text-[var(--muted)]"
          >
            <span
              className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/80"
              style={{ backgroundColor: "var(--marker-event)" }}
              aria-hidden
            >
              <Icon className="h-2.5 w-2.5 text-white" strokeWidth={2.5} />
            </span>
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
}
