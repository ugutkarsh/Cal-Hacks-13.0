/**
 * Collapse near-duplicate imported events for map display.
 * Prefers the row with the richer description / newer id when URLs match.
 */

import { normalizeSourceUrl } from "@/lib/apify/import-draft";
import type { EventEntity, MapEntity } from "@/types/map-entities";

function eventDedupeKey(event: EventEntity): string {
  if (event.sourceUrl) {
    return `url:${normalizeSourceUrl(event.sourceUrl)}`;
  }
  const day = event.startsAt.slice(0, 10);
  const title = event.name.toLowerCase().replace(/\s+/g, " ").trim();
  const lat = event.coordinates.lat.toFixed(2);
  const lng = event.coordinates.lng.toFixed(2);
  return `meta:${title}|${day}|${lat}|${lng}`;
}

function preferEvent(a: EventEntity, b: EventEntity): EventEntity {
  if (a.summary.length !== b.summary.length) {
    return a.summary.length >= b.summary.length ? a : b;
  }
  return a.createdAt >= b.createdAt ? a : b;
}

export function dedupeMapEntities(entities: MapEntity[]): MapEntity[] {
  const eventsByKey = new Map<string, EventEntity>();
  const others: MapEntity[] = [];

  for (const entity of entities) {
    if (entity.kind !== "event") {
      others.push(entity);
      continue;
    }
    const key = eventDedupeKey(entity);
    const prev = eventsByKey.get(key);
    eventsByKey.set(key, prev ? preferEvent(prev, entity) : entity);
  }

  return [...others, ...eventsByKey.values()];
}
