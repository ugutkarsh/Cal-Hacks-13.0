import type { EventReview } from "@/types/map-entities";

/** Stable content hash for cache invalidation when source reviews change. */
export function hashReviewEvidence(
  entityId: string,
  reviews: EventReview[],
  extras?: string,
): string {
  const parts = reviews
    .map(
      (r) =>
        `${r.id}|${r.rating}|${r.createdAt}|${(r.comment ?? "").slice(0, 500)}`,
    )
    .sort();
  const raw = `${entityId}::${parts.join(";;")}::${extras ?? ""}`;
  // Simple FNV-1a 32-bit — enough for cache keys, not crypto.
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `ev_${(h >>> 0).toString(16)}`;
}
