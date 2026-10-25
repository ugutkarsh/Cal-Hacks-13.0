"use client";

import { memo, useCallback, useEffect, useState } from "react";
import { FallbackDiscoveryMap } from "@/components/map/fallback-discovery-map";
import { GoogleDiscoveryMap } from "@/components/map/google-discovery-map";
import { hasGoogleMapsKey } from "@/lib/env";
import type { RelevanceTier } from "@/lib/map/discovery-visibility";
import { resolveMapRenderMode } from "@/lib/map-mode";
import type { MapEntity } from "@/types/map-entities";

interface DiscoveryMapProps {
  entities: MapEntity[];
  selectedId: string | null;
  /** Pin matching a hovered activity card. */
  emphasizedId?: string | null;
  recommendedIds?: Set<string>;
  relevanceById?: Map<string, RelevanceTier>;
  onSelect: (entity: MapEntity) => void;
  userCenter?: { lat: number; lng: number } | null;
}

/**
 * Neutral shell shared by SSR and the first client paint so Google vs fallback
 * is chosen only after mount (avoids hydration mismatches from Maps / env).
 */
function MapMountShell() {
  return (
    <div
      className="h-full w-full bg-[var(--brand-mist)]"
      aria-hidden
      data-map-shell
    />
  );
}

function DiscoveryMapInner({
  entities,
  selectedId,
  emphasizedId = null,
  recommendedIds,
  relevanceById,
  onSelect,
  userCenter = null,
}: DiscoveryMapProps) {
  const [mounted, setMounted] = useState(false);
  const [mapsLoadFailed, setMapsLoadFailed] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleMapsError = useCallback((error: unknown) => {
    console.error("[trailmap] Google Maps failed to load:", error);
    setMapsLoadFailed(true);
  }, []);

  if (!mounted) {
    return <MapMountShell />;
  }

  const mode = resolveMapRenderMode({
    hasApiKey: hasGoogleMapsKey(),
    mapsLoadFailed,
  });

  if (mode === "fallback") {
    return (
      <FallbackDiscoveryMap
        entities={entities}
        selectedId={selectedId}
        emphasizedId={emphasizedId}
        recommendedIds={recommendedIds}
        relevanceById={relevanceById}
        onSelect={onSelect}
        reason={mapsLoadFailed ? "load-error" : "missing-key"}
      />
    );
  }

  return (
    <GoogleDiscoveryMap
      entities={entities}
      selectedId={selectedId}
      emphasizedId={emphasizedId}
      recommendedIds={recommendedIds}
      relevanceById={relevanceById}
      onSelect={onSelect}
      onMapsError={handleMapsError}
      userCenter={userCenter}
    />
  );
}

/** Skip re-renders when only overlay panels toggle in the parent. */
export const DiscoveryMap = memo(DiscoveryMapInner);
