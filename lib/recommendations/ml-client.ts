/**
 * Server-side client for the FastAPI sklearn recommender.
 * Never call this from the browser with catalog data.
 */

import type { EventEntity } from "@/types/map-entities";
import type { UserPreferences } from "@/types/preferences";
import type {
  RecommendationReason,
  RecommendationResult,
  ScoredRecommendation,
} from "@/types/recommendations";

export type MlActivityPayload = {
  id: string;
  title: string;
  description: string;
  category: string;
  starts_at: string | null;
  latitude: number | null;
  longitude: number | null;
  cost_cents: number | null;
  difficulty_label: string | null;
};

type MlRankedRow = {
  activity_id: string;
  relevance_score: number;
  reasons: Array<{ code: string; label: string }>;
  excluded?: boolean;
  exclusion_reason?: string | null;
};

type MlResponse = {
  ok?: boolean;
  method?: string;
  method_note?: string;
  ranked?: MlRankedRow[];
  excluded?: MlRankedRow[];
};

export function getRecommenderUrl(): string | null {
  const raw = process.env.RECOMMENDER_URL?.trim();
  if (!raw || raw.startsWith("your-")) return null;
  return raw.replace(/\/$/, "");
}

export function eventToMlPayload(event: EventEntity): MlActivityPayload {
  return {
    id: event.id,
    title: event.name,
    description: event.summary ?? "",
    category: event.category,
    starts_at: event.startsAt ?? null,
    latitude: event.coordinates?.lat ?? null,
    longitude: event.coordinates?.lng ?? null,
    cost_cents: event.costCents ?? null,
    difficulty_label: event.difficultyLabel ?? null,
  };
}

export function preferencesToMlPayload(preferences: UserPreferences) {
  return {
    preferred_categories: preferences.preferredCategories,
    max_budget_cents: preferences.maxBudgetCents,
    max_distance_km: preferences.maxDistanceKm,
    available_days: preferences.availableDays,
    time_window: {
      start_hour: preferences.timeWindow.startHour,
      end_hour: preferences.timeWindow.endHour,
    },
    skill_preference: preferences.skillPreference,
    starting_point: preferences.startingPoint
      ? {
          lat: preferences.startingPoint.lat,
          lng: preferences.startingPoint.lng,
        }
      : null,
  };
}

function mapReasons(
  reasons: Array<{ code: string; label: string }> | undefined,
): RecommendationReason[] {
  return (reasons ?? []).map((r) => ({
    code: r.code,
    label: r.label,
  }));
}

function attachActivities(
  rows: MlRankedRow[] | undefined,
  byId: Map<string, EventEntity>,
): ScoredRecommendation[] {
  const out: ScoredRecommendation[] = [];
  for (const row of rows ?? []) {
    const activity = byId.get(row.activity_id);
    if (!activity) continue; // never fabricate missing catalog rows
    out.push({
      activity,
      score: row.relevance_score,
      reasons: mapReasons(row.reasons),
      excluded: Boolean(row.excluded),
      exclusionReason: row.exclusion_reason ?? null,
    });
  }
  return out;
}

const DEFAULT_TIMEOUT_MS = 15_000;
/** FastAPI request model caps catalog size; keep a safety margin. */
const MAX_ACTIVITIES_TO_ML = 500;

export async function fetchMlRecommendations(input: {
  preferences: UserPreferences;
  events: EventEntity[];
  limit?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<RecommendationResult | null> {
  const base = getRecommenderUrl();
  if (!base) return null;

  const catalog = input.events.slice(0, MAX_ACTIVITIES_TO_ML);
  const byId = new Map(catalog.map((e) => [e.id, e]));

  const controller = new AbortController();
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onOuterAbort = () => controller.abort();
  input.signal?.addEventListener("abort", onOuterAbort);

  let res: Response;
  try {
    res = await fetch(`${base}/recommendations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        preferences: preferencesToMlPayload(input.preferences),
        activities: catalog.map(eventToMlPayload),
        limit: input.limit ?? 20,
      }),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Recommender request timed out");
    }
    throw err;
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener("abort", onOuterAbort);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Recommender HTTP ${res.status}${detail ? `: ${detail.slice(0, 180)}` : ""}`,
    );
  }

  const data = (await res.json()) as MlResponse;
  if (data.ok === false) {
    throw new Error("Recommender returned ok:false");
  }

  return {
    ranked: attachActivities(data.ranked, byId),
    excluded: attachActivities(data.excluded, byId),
    method: "tfidf-cosine",
    methodNote:
      data.method_note ??
      "Ranked from your interests, schedule, and distance.",
  };
}
