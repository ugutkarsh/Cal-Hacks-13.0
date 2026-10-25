/**
 * Server-side rate gate for auto ingest (in-process).
 * Not a distributed lock — good enough for a single Next.js process / hackathon.
 */

const lastRunByBucket = new Map<string, number>();

export function geoBucket(lat: number, lng: number): string {
  // ~11 km cells — one refresh shared across nearby opens
  return `${lat.toFixed(1)},${lng.toFixed(1)}`;
}

export function shouldSkipAutoIngest(
  lat: number,
  lng: number,
  minIntervalMs: number,
): { skip: boolean; bucket: string; retryAfterMs?: number } {
  const bucket = geoBucket(lat, lng);
  const last = lastRunByBucket.get(bucket);
  if (last == null) return { skip: false, bucket };
  const elapsed = Date.now() - last;
  if (elapsed < minIntervalMs) {
    return {
      skip: true,
      bucket,
      retryAfterMs: minIntervalMs - elapsed,
    };
  }
  return { skip: false, bucket };
}

export function markAutoIngestStarted(bucket: string): void {
  lastRunByBucket.set(bucket, Date.now());
}

/** Test helper — clears in-process cooldown map. */
export function resetAutoIngestGateForTests(): void {
  lastRunByBucket.clear();
}

export function isAutoIngestEnabled(): boolean {
  const flag = process.env.AUTO_INGEST_ON_OPEN?.trim().toLowerCase();
  if (flag === "false" || flag === "0") return false;
  if (flag === "true" || flag === "1") return true;
  return false;
}

/**
 * Minimum wait between auto-ingests for the same geo bucket.
 * Default 1 minute. Env `AUTO_INGEST_MIN_INTERVAL_MINUTES` may be fractional
 * (e.g. `0.5` = 30s). Floor is 15 seconds so rapid reloads don't spam Apify.
 */
export function autoIngestMinIntervalMs(): number {
  const raw = process.env.AUTO_INGEST_MIN_INTERVAL_MINUTES?.trim();
  const minutes = raw == null || raw === "" ? 1 : Number(raw);
  if (!Number.isFinite(minutes) || minutes <= 0) return 60_000;
  const ms = minutes * 60_000;
  const floorMs = 15_000;
  const ceilingMs = 24 * 60 * 60_000;
  return Math.min(ceilingMs, Math.max(floorMs, ms));
}

export function formatRetryAfter(retryAfterMs: number): string {
  const sec = Math.max(1, Math.ceil(retryAfterMs / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.ceil(sec / 60);
  return `${min} min`;
}
