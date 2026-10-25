import { NextResponse } from "next/server";
import { sanitizeFeedbackList } from "@/lib/feedback/validation";
import { loadMapEntities } from "@/lib/data/map-entities";
import {
  fetchMlRecommendations,
  getRecommenderUrl,
} from "@/lib/recommendations/ml-client";
import {
  applyFeedbackToRecommendationResult,
  recommendActivities,
} from "@/lib/recommendations/rank";
import type { FeedbackEvent } from "@/types/feedback";
import type { EventEntity } from "@/types/map-entities";
import type { UserPreferences } from "@/types/preferences";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function serializeResult(
  rules: ReturnType<typeof recommendActivities>,
  limit: number,
) {
  return {
    method: rules.method,
    methodNote: rules.methodNote,
    ranked: rules.ranked.slice(0, limit).map((r) => ({
      activityId: r.activity.id,
      score: r.score,
      reasons: r.reasons,
      excluded: r.excluded,
      exclusionReason: r.exclusionReason,
    })),
    excluded: rules.excluded.map((r) => ({
      activityId: r.activity.id,
      score: r.score,
      reasons: r.reasons,
      excluded: r.excluded,
      exclusionReason: r.exclusionReason,
    })),
  };
}

/**
 * Server-side recommendations:
 * 1) Load real catalog from Supabase/demo via existing loader.
 * 2) Prefer FastAPI sklearn recommender when RECOMMENDER_URL is set.
 * 3) Apply soft feedback rules on top (dismiss + affinity) — not a trained feedback model.
 * 4) Fall back to deterministic preference rules — explicitly labeled.
 */
export async function POST(request: Request) {
  let body: {
    preferences?: UserPreferences;
    limit?: number;
    feedback?: FeedbackEvent[];
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const preferences = body.preferences;
  if (
    !preferences ||
    typeof preferences !== "object" ||
    Array.isArray(preferences)
  ) {
    return NextResponse.json(
      { ok: false, error: "preferences object required" },
      { status: 400 },
    );
  }

  const prefs: UserPreferences = {
    ...(preferences as UserPreferences),
  };

  if (
    typeof prefs.maxDistanceKm === "number" &&
    Number.isFinite(prefs.maxDistanceKm)
  ) {
    prefs.maxDistanceKm = Math.min(20_000, Math.max(0.1, prefs.maxDistanceKm));
  } else if (prefs.maxDistanceKm == null) {
    prefs.maxDistanceKm = 25;
  }
  if (
    prefs.maxBudgetCents != null &&
    (typeof prefs.maxBudgetCents !== "number" || prefs.maxBudgetCents < 0)
  ) {
    prefs.maxBudgetCents = null;
  }
  if (!Array.isArray(prefs.preferredCategories)) {
    prefs.preferredCategories = [];
  }
  if (!Array.isArray(prefs.availableDays)) {
    prefs.availableDays = [];
  }
  if (!prefs.timeWindow || typeof prefs.timeWindow !== "object") {
    prefs.timeWindow = { startHour: 0, endHour: 23 };
  }
  if (!prefs.skillPreference) {
    prefs.skillPreference = "any";
  }

  const history = sanitizeFeedbackList(body.feedback ?? []);

  const limit =
    typeof body.limit === "number" && body.limit > 0
      ? Math.min(100, body.limit)
      : 20;

  const loaded = await loadMapEntities(
    { search: "", category: "all", kinds: ["event"] },
    { forceDemo: false },
  );

  if (loaded.error) {
    return NextResponse.json(
      {
        ok: false,
        error: loaded.error,
        note: "Catalog load failed — no fabricated recommendations.",
      },
      { status: 502 },
    );
  }

  const events = loaded.entities.filter(
    (e): e is EventEntity => e.kind === "event",
  );

  const recommenderUrl = getRecommenderUrl();

  if (recommenderUrl) {
    try {
      const ml = await fetchMlRecommendations({
        preferences: prefs,
        events,
        limit: Math.min(100, limit + history.length),
      });
      if (ml) {
        const withFeedback = applyFeedbackToRecommendationResult(ml, history);
        return NextResponse.json({
          ok: true,
          source: "sklearn",
          catalogSize: events.length,
          dataMode: loaded.meta.mode,
          feedbackApplied: history.length > 0,
          personalizationMethod: "deterministic-feedback-rules",
          result: {
            method: withFeedback.method,
            methodNote: withFeedback.methodNote,
            ranked: withFeedback.ranked.slice(0, limit).map((r) => ({
              activityId: r.activity.id,
              score: r.score,
              reasons: r.reasons,
              excluded: r.excluded,
              exclusionReason: r.exclusionReason,
            })),
            excluded: withFeedback.excluded.map((r) => ({
              activityId: r.activity.id,
              score: r.score,
              reasons: r.reasons,
              excluded: r.excluded,
              exclusionReason: r.exclusionReason,
            })),
          },
        });
      }
    } catch {
      const rules = recommendActivities(events, prefs, history);
      return NextResponse.json({
        ok: true,
        source: "rules-fallback",
        catalogSize: events.length,
        dataMode: loaded.meta.mode,
        feedbackApplied: history.length > 0,
        personalizationMethod: "deterministic-feedback-rules",
        result: {
          ...serializeResult(rules, limit),
          method: "rules-fallback",
          methodNote:
            "Matched to your interests, schedule, budget, and distance — with soft feedback rules (not a trained model).",
        },
      });
    }
  }

  const rules = recommendActivities(events, prefs, history);
  return NextResponse.json({
    ok: true,
    source: "rules",
    catalogSize: events.length,
    dataMode: loaded.meta.mode,
    feedbackApplied: history.length > 0,
    personalizationMethod: "deterministic-feedback-rules",
    result: serializeResult(rules, limit),
  });
}
