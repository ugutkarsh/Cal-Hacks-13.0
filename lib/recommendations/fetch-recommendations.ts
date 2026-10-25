/**
 * Browser helper: ask Next.js `/api/recommendations` (server talks to FastAPI).
 */

import type { FeedbackEvent } from "@/types/feedback";
import type { EventEntity } from "@/types/map-entities";
import type { UserPreferences } from "@/types/preferences";
import type {
  RecommendationMethod,
  RecommendationReason,
  RecommendationResult,
  ScoredRecommendation,
} from "@/types/recommendations";

type ApiRow = {
  activityId: string;
  score: number;
  reasons: RecommendationReason[];
  excluded: boolean;
  exclusionReason: string | null;
};

type ApiResponse = {
  ok?: boolean;
  error?: string;
  source?: string;
  result?: {
    method: RecommendationMethod | string;
    methodNote: string;
    ranked: ApiRow[];
    excluded: ApiRow[];
  };
};

function hydrate(
  rows: ApiRow[] | undefined,
  byId: Map<string, EventEntity>,
): ScoredRecommendation[] {
  const out: ScoredRecommendation[] = [];
  for (const row of rows ?? []) {
    const activity = byId.get(row.activityId);
    if (!activity) continue;
    out.push({
      activity,
      score: row.score,
      reasons: row.reasons ?? [],
      excluded: row.excluded,
      exclusionReason: row.exclusionReason,
    });
  }
  return out;
}

export async function fetchRecommendationsFromApi(input: {
  preferences: UserPreferences;
  events: EventEntity[];
  feedback?: FeedbackEvent[];
  limit?: number;
  signal?: AbortSignal;
}): Promise<RecommendationResult | null> {
  const res = await fetch("/api/recommendations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: input.signal,
    body: JSON.stringify({
      preferences: input.preferences,
      feedback: input.feedback ?? [],
      limit: input.limit ?? 20,
    }),
  });

  const data = (await res.json()) as ApiResponse;
  if (!res.ok || !data.ok || !data.result) {
    throw new Error(data.error ?? `Recommendations failed (${res.status})`);
  }

  const byId = new Map(input.events.map((e) => [e.id, e]));
  const method = (data.result.method ??
    "deterministic-weighted-rules") as RecommendationMethod;

  return {
    method,
    methodNote: data.result.methodNote,
    ranked: hydrate(data.result.ranked, byId),
    excluded: hydrate(data.result.excluded, byId),
  };
}
