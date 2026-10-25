"use client";

import type { FeedbackAction } from "@/types/feedback";
import type { RecommendationResult } from "@/types/recommendations";
import { Bookmark, Heart, SkipForward, Sparkles } from "lucide-react";

interface ForYouPanelProps {
  result: RecommendationResult | null;
  selectedId: string | null;
  onSelectActivityId: (id: string) => void;
  personalized: boolean;
  /** Optional quick actions on each recommendation row. */
  onFeedback?: (
    activityId: string,
    action: FeedbackAction,
    category?: string | null,
  ) => void;
  feedbackCount?: number;
}

export function ForYouPanel({
  result,
  selectedId,
  onSelectActivityId,
  personalized,
  onFeedback,
  feedbackCount = 0,
}: ForYouPanelProps) {
  if (!personalized || !result) return null;

  const top = result.ranked.slice(0, 5);

  return (
    <aside
      className="pointer-events-auto absolute bottom-4 right-3 z-30 hidden w-[280px] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]/95 shadow-xl backdrop-blur md:block"
      aria-label="Personalized recommendations"
    >
      <div className="border-b border-[var(--border)] px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-[var(--accent)]" aria-hidden />
          For you
        </div>
        <p className="mt-0.5 text-[10px] leading-snug text-[var(--muted)]">
          {feedbackCount > 0
            ? "Matched to your prefs — soft tweaks from saves/likes (rules, not a trained model)."
            : result.method === "tfidf-cosine"
              ? "Ranked from your interests, schedule, and distance."
              : "Matched to your interests, schedule, budget, and distance."}
        </p>
      </div>

      {top.length === 0 ? (
        <p className="p-3 text-xs text-[var(--muted)]">
          No activities match your hard constraints. Relax budget, distance,
          schedule, or skill in Preferences.
        </p>
      ) : (
        <ul className="max-h-64 overflow-y-auto p-2">
          {top.map((item, index) => (
            <li key={item.activity.id} className="mb-1">
              <button
                type="button"
                onClick={() => onSelectActivityId(item.activity.id)}
                className={`w-full rounded-lg px-2 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${
                  selectedId === item.activity.id
                    ? "bg-[var(--accent)]/10"
                    : "hover:bg-[var(--surface-hover)]"
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-semibold text-[var(--muted)]">
                    #{index + 1}
                  </span>
                  <span className="text-[10px] text-[var(--muted)]">
                    score {item.score}
                  </span>
                </div>
                <p className="text-sm font-medium leading-snug">
                  {item.activity.name}
                </p>
                {item.reasons[0] && (
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-[var(--muted)]">
                    {item.reasons[0].label}
                  </p>
                )}
              </button>
              {onFeedback && (
                <div className="mt-0.5 flex gap-1 px-1 pb-1">
                  <button
                    type="button"
                    title="Save"
                    aria-label={`Save ${item.activity.name}`}
                    className="rounded border border-[var(--border)] p-1 text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
                    onClick={() =>
                      onFeedback(
                        item.activity.id,
                        "save",
                        item.activity.category,
                      )
                    }
                  >
                    <Bookmark className="h-3 w-3" aria-hidden />
                  </button>
                  <button
                    type="button"
                    title="Like"
                    aria-label={`Like ${item.activity.name}`}
                    className="rounded border border-[var(--border)] p-1 text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
                    onClick={() =>
                      onFeedback(
                        item.activity.id,
                        "like",
                        item.activity.category,
                      )
                    }
                  >
                    <Heart className="h-3 w-3" aria-hidden />
                  </button>
                  <button
                    type="button"
                    title="Dismiss"
                    aria-label={`Dismiss ${item.activity.name}`}
                    className="rounded border border-[var(--border)] p-1 text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
                    onClick={() =>
                      onFeedback(
                        item.activity.id,
                        "skip",
                        item.activity.category,
                      )
                    }
                  >
                    <SkipForward className="h-3 w-3" aria-hidden />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
