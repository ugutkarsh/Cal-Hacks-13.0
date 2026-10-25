/**
 * Client helper: ask the server to refresh nearby Apify events (rate-limited).
 * Does not embed INGEST_SECRET — server opts in via AUTO_INGEST_ON_OPEN.
 */

const LAST_KEY_PREFIX = "trailmap.autoIngest.lastAt:";
/** Match server default (~1 min). Per geo bucket, not global. */
const CLIENT_COOLDOWN_MS = 60 * 1000;

export type AutoRefreshResult = {
  ran: boolean;
  skipped?: boolean;
  reason?: string;
  location?: string;
  summary?: {
    imported?: number;
    updated?: number;
    fetched?: number;
    descriptionsEnriched?: number;
  };
  error?: string;
};

function clientBucket(lat: number, lng: number): string {
  return `${lat.toFixed(1)},${lng.toFixed(1)}`;
}

function clientCooldownActive(lat: number, lng: number): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(
      LAST_KEY_PREFIX + clientBucket(lat, lng),
    );
    if (!raw) return false;
    const t = Number(raw);
    return Number.isFinite(t) && Date.now() - t < CLIENT_COOLDOWN_MS;
  } catch {
    return false;
  }
}

function markClientCooldown(lat: number, lng: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      LAST_KEY_PREFIX + clientBucket(lat, lng),
      String(Date.now()),
    );
  } catch {
    // ignore
  }
}

export async function requestNearbyEventsRefresh(input: {
  lat: number;
  lng: number;
  /** City/place name for Apify search (preferred over raw coordinates). */
  locationLabel?: string | null;
  /** Bypass client cooldown (e.g. user just chose a new city). */
  force?: boolean;
}): Promise<AutoRefreshResult> {
  if (!input.force && clientCooldownActive(input.lat, input.lng)) {
    return {
      ran: false,
      skipped: true,
      reason: "Client cooldown — nearby data was refreshed recently for this area",
    };
  }

  try {
    const res = await fetch("/api/ingest/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lat: input.lat,
        lng: input.lng,
        locationLabel: input.locationLabel ?? undefined,
        force: input.force === true,
      }),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      skipped?: boolean;
      reason?: string;
      error?: string;
      location?: string;
      summary?: AutoRefreshResult["summary"];
    };

    if (res.status === 404 || res.status === 501) {
      return {
        ran: false,
        skipped: true,
        reason: data.reason ?? "Auto-ingest is disabled on the server",
      };
    }

    if (!res.ok) {
      return {
        ran: false,
        error: data.error ?? `Refresh failed (${res.status})`,
      };
    }

    if (!data.skipped) {
      markClientCooldown(input.lat, input.lng);
    }

    return {
      ran: !data.skipped,
      skipped: Boolean(data.skipped),
      reason: data.reason,
      location: data.location,
      summary: data.summary,
    };
  } catch (err) {
    return {
      ran: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}
