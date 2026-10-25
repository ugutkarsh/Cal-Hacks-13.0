"use client";

import { useMemo } from "react";
import { MapMarkerButton } from "@/components/map/map-marker";
import { MOCK_MAP_CENTER } from "@/data/mock/map-entities";
import {
  sortEntitiesForMarkerStack,
  type RelevanceTier,
} from "@/lib/map/discovery-visibility";
import type { MapEntity } from "@/types/map-entities";

interface FallbackDiscoveryMapProps {
  entities: MapEntity[];
  selectedId: string | null;
  emphasizedId?: string | null;
  recommendedIds?: Set<string>;
  relevanceById?: Map<string, RelevanceTier>;
  onSelect: (entity: MapEntity) => void;
  /** Why fallback is shown — missing key (default) or Maps JS load failure. */
  reason?: "missing-key" | "load-error";
}

/** Rough geographic projection for local-dev fallback when Maps key is missing. */
function toPercent(entity: MapEntity, all: MapEntity[]) {
  const lats = all.map((e) => e.coordinates.lat);
  const lngs = all.map((e) => e.coordinates.lng);
  const minLat = Math.min(...lats, MOCK_MAP_CENTER.lat - 0.05);
  const maxLat = Math.max(...lats, MOCK_MAP_CENTER.lat + 0.05);
  const minLng = Math.min(...lngs, MOCK_MAP_CENTER.lng - 0.08);
  const maxLng = Math.max(...lngs, MOCK_MAP_CENTER.lng + 0.08);

  const x = ((entity.coordinates.lng - minLng) / (maxLng - minLng || 1)) * 100;
  const y =
    (1 - (entity.coordinates.lat - minLat) / (maxLat - minLat || 1)) * 100;

  return {
    left: `${Math.min(92, Math.max(8, x))}%`,
    top: `${Math.min(90, Math.max(10, y))}%`,
  };
}

export function FallbackDiscoveryMap({
  entities,
  selectedId,
  emphasizedId = null,
  recommendedIds,
  relevanceById,
  onSelect,
  reason = "missing-key",
}: FallbackDiscoveryMapProps) {
  const stacked = useMemo(
    () =>
      sortEntitiesForMarkerStack(entities, {
        selectedId,
        emphasizedId,
        relevanceById: relevanceById ?? new globalThis.Map(),
      }),
    [entities, selectedId, emphasizedId, relevanceById],
  );

  const title =
    reason === "load-error"
      ? "Google Maps failed to load"
      : "Maps API key not configured";
  const body =
    reason === "load-error"
      ? "Your key was found, but Maps failed to initialize. In Google Cloud: enable Maps JavaScript API, enable billing, allow localhost referrers if restricted, and set NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=DEMO_MAP_ID (or a real Map Management ID). Restart npm run dev after changing .env.local."
      : undefined;

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      role="application"
      aria-label="Local development map fallback"
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 30% 20%, #dce8df 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, #c5d4e8 0%, transparent 45%), linear-gradient(160deg, #b9cfc0 0%, #9eb6c9 45%, #8aa3b5 100%)",
        }}
      />
      {/* Soft terrain grid */}
      <svg
        className="absolute inset-0 h-full w-full opacity-30"
        aria-hidden
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern
            id="grid"
            width="48"
            height="48"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 48 0 L 0 0 0 48"
              fill="none"
              stroke="#1a3a2a"
              strokeWidth="0.5"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
        <path
          d="M80 420 Q 240 240, 440 320 T 760 200"
          fill="none"
          stroke="#2d5a45"
          strokeWidth="3"
          opacity="0.35"
        />
        <path
          d="M0 360 Q 320 450, 800 330"
          fill="none"
          stroke="#4a6fa5"
          strokeWidth="8"
          opacity="0.25"
        />
      </svg>

      {/* Below the nav panel so the setup message stays visible */}
      <div className="absolute bottom-16 left-3 right-3 z-20 max-w-md rounded-lg border border-[var(--border)] bg-[var(--surface)]/95 p-3 shadow-lg backdrop-blur sm:left-4 sm:right-auto">
        <p className="text-sm font-semibold text-[var(--foreground)]">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
          {body ?? (
            <>
              Add{" "}
              <code className="rounded bg-[var(--surface-elevated)] px-1 py-0.5 text-[11px]">
                NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
              </code>{" "}
              to <code className="text-[11px]">.env.local</code>, enable{" "}
              <strong>Maps JavaScript API</strong> + billing, and use Map ID{" "}
              <code className="text-[11px]">DEMO_MAP_ID</code> (or a Cloud Map
              Management ID). This canvas keeps discovery usable meanwhile.
            </>
          )}
        </p>
      </div>

      {stacked.map((entity) => {
        const pos = toPercent(entity, entities);
        const relevance = relevanceById?.get(entity.id) ?? "none";
        return (
          <div
            key={entity.id}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: pos.left, top: pos.top }}
          >
            <MapMarkerButton
              kind={entity.kind}
              category={entity.category}
              name={entity.name}
              selected={selectedId === entity.id}
              emphasized={emphasizedId === entity.id}
              recommended={recommendedIds?.has(entity.id) ?? false}
              relevance={relevance}
              onSelect={() => onSelect(entity)}
            />
          </div>
        );
      })}
    </div>
  );
}
