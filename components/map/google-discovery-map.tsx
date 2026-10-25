"use client";

import { useCallback, useEffect, useMemo } from "react";
import {
  APIProvider,
  Map,
  AdvancedMarker,
  useMap,
} from "@vis.gl/react-google-maps";
import { MapMarkerButton } from "@/components/map/map-marker";
import { MOCK_MAP_CENTER } from "@/data/mock/map-entities";
import { publicEnv } from "@/lib/env";
import {
  sortEntitiesForMarkerStack,
  type RelevanceTier,
} from "@/lib/map/discovery-visibility";
import type { MapEntity } from "@/types/map-entities";

interface GoogleDiscoveryMapProps {
  entities: MapEntity[];
  selectedId: string | null;
  emphasizedId?: string | null;
  recommendedIds?: Set<string>;
  relevanceById?: Map<string, RelevanceTier>;
  onSelect: (entity: MapEntity) => void;
  onMapsError?: (error: unknown) => void;
  /** Prefer centering near the user when available — approximate prefs pin only. */
  userCenter?: { lat: number; lng: number } | null;
}

function FitBounds({
  entities,
  userCenter,
}: {
  entities: MapEntity[];
  userCenter?: { lat: number; lng: number } | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map || typeof window === "undefined") return;
    if (!window.google?.maps) return;

    if (userCenter) {
      map.setCenter(userCenter);
      map.setZoom(entities.length > 0 ? 12 : 13);
      return;
    }

    if (entities.length === 0) return;
    const bounds = new window.google.maps.LatLngBounds();
    entities.forEach((e) => {
      bounds.extend({ lat: e.coordinates.lat, lng: e.coordinates.lng });
    });
    map.fitBounds(bounds, 80);
  }, [map, entities, userCenter]);

  return null;
}

export function GoogleDiscoveryMap({
  entities,
  selectedId,
  emphasizedId = null,
  recommendedIds,
  relevanceById,
  onSelect,
  onMapsError,
  userCenter = null,
}: GoogleDiscoveryMapProps) {
  const apiKey = publicEnv.googleMapsApiKey!;

  const handleSelect = useCallback(
    (entity: MapEntity) => {
      onSelect(entity);
    },
    [onSelect],
  );

  const stacked = useMemo(
    () =>
      sortEntitiesForMarkerStack(entities, {
        selectedId,
        emphasizedId,
        relevanceById: relevanceById ?? new globalThis.Map(),
      }),
    [entities, selectedId, emphasizedId, relevanceById],
  );

  return (
    <APIProvider apiKey={apiKey} onError={onMapsError}>
      <Map
        defaultCenter={userCenter ?? MOCK_MAP_CENTER}
        defaultZoom={12}
        mapId={publicEnv.googleMapsMapId}
        gestureHandling="greedy"
        disableDefaultUI={false}
        className="h-full w-full"
        aria-label="Discovery map"
      >
        <FitBounds entities={entities} userCenter={userCenter} />
        {stacked.map((entity) => {
          const relevance = relevanceById?.get(entity.id) ?? "none";
          return (
            <AdvancedMarker
              key={entity.id}
              position={entity.coordinates}
              onClick={() => handleSelect(entity)}
              zIndex={
                selectedId === entity.id
                  ? 40
                  : emphasizedId === entity.id
                    ? 30
                    : relevance === "high"
                      ? 20
                      : relevance === "medium"
                        ? 15
                        : 10
              }
            >
              <MapMarkerButton
                kind={entity.kind}
                category={entity.category}
                name={entity.name}
                selected={selectedId === entity.id}
                emphasized={emphasizedId === entity.id}
                recommended={recommendedIds?.has(entity.id) ?? false}
                relevance={relevance}
                onSelect={() => handleSelect(entity)}
              />
            </AdvancedMarker>
          );
        })}
      </Map>
    </APIProvider>
  );
}
