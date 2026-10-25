/**
 * In-process evidence summary cache.
 * Invalidates when contentHash changes (source reviews updated).
 */

import type {
  EvidenceSummary,
  EvidenceSummaryCacheEntry,
} from "@/types/evidence-summary";

const store = new Map<string, EvidenceSummaryCacheEntry>();

export function cacheKey(entityId: string, contentHash: string): string {
  return `${entityId}:${contentHash}`;
}

export function getCachedEvidenceSummary(
  entityId: string,
  contentHash: string,
): EvidenceSummary | null {
  const entry = store.get(cacheKey(entityId, contentHash));
  if (!entry) return null;
  if (entry.hash !== contentHash) {
    store.delete(cacheKey(entityId, contentHash));
    return null;
  }
  return entry.summary;
}

export function setCachedEvidenceSummary(summary: EvidenceSummary): void {
  store.set(cacheKey(summary.entityId, summary.contentHash), {
    hash: summary.contentHash,
    summary,
    storedAt: new Date().toISOString(),
  });
}

/** Drop entries for an entity (any hash) — used when sources change. */
export function invalidateEvidenceCacheForEntity(entityId: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(`${entityId}:`)) store.delete(key);
  }
}

export function clearEvidenceCacheForTests(): void {
  store.clear();
}

export function evidenceCacheSizeForTests(): number {
  return store.size;
}
