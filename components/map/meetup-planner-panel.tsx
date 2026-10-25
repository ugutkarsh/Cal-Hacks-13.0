"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  MeetupPlan,
  MeetupPlanCriteria,
  MeetupPlanOption,
} from "@/types/meetup-plan";
import {
  CalendarDays,
  LoaderCircle,
  MapPin,
  Sparkles,
  X,
} from "lucide-react";

type MeetupPlannerPanelProps = {
  open: boolean;
  busy: boolean;
  shareBusy: boolean;
  error: string | null;
  shareNote: string | null;
  plan: MeetupPlan | null;
  signedIn: boolean;
  onClose: () => void;
  onUpdateCriteria: (criteria: MeetupPlanCriteria) => void;
  onBuildPlan: () => void;
  onSelectOption: (option: MeetupPlanOption) => void;
  onShare: (message: string) => void;
  onRequestSignIn: () => void;
};

export function MeetupPlannerPanel({
  open,
  busy,
  shareBusy,
  error,
  shareNote,
  plan,
  signedIn,
  onClose,
  onUpdateCriteria,
  onBuildPlan,
  onSelectOption,
  onShare,
  onRequestSignIn,
}: MeetupPlannerPanelProps) {
  const [draftMessage, setDraftMessage] = useState("");

  if (!open || !plan) return null;
  const criteria = plan.criteria;

  function patch<K extends keyof MeetupPlanCriteria>(
    key: K,
    value: MeetupPlanCriteria[K],
  ) {
    onUpdateCriteria({ ...criteria, [key]: value });
  }

  return (
    <div
      className="pointer-events-auto absolute bottom-4 left-3 right-3 z-40 max-h-[52dvh] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]/97 shadow-[var(--shadow-panel)] backdrop-blur-md sm:left-4 sm:right-auto sm:w-[400px]"
      role="region"
      aria-label="Meetup planner"
    >
      <div className="flex items-start justify-between gap-2 border-b border-[var(--border)] bg-[var(--surface-elevated)]/70 px-3 py-2.5">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <CalendarDays className="h-3.5 w-3.5 text-[var(--accent)]" aria-hidden />
            Meetup planner
          </p>
          <p className="mt-0.5 text-[10px] text-[var(--muted)]">
            Suggested plan from catalog · not a booking
          </p>
        </div>
        <button
          type="button"
          className="rounded-full p-1.5 hover:bg-[var(--surface-hover)]"
          aria-label="Close planner"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="max-h-[44dvh] space-y-3 overflow-y-auto p-3">
        <p className="rounded-lg bg-[var(--surface-elevated)] px-2.5 py-1.5 text-[10px] leading-snug text-[var(--muted)]">
          {plan.disclaimer}
        </p>
        <p className="text-[10px] text-[var(--muted)]">{plan.limitation}</p>

        <div className="space-y-2">
          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
            Review criteria
          </p>
          <label className="block space-y-1">
            <span className="text-[11px] text-[var(--muted)]">Activity</span>
            <Input
              value={criteria.activity ?? ""}
              onChange={(e) => patch("activity", e.target.value.trim() || null)}
              className="h-9"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] text-[var(--muted)]">City</span>
            <Input
              value={criteria.city ?? ""}
              onChange={(e) => patch("city", e.target.value.trim() || null)}
              className="h-9"
            />
          </label>
          <div className="flex gap-2">
            <label className="block flex-1 space-y-1">
              <span className="text-[11px] text-[var(--muted)]">Group size</span>
              <Input
                type="number"
                min={1}
                max={200}
                value={criteria.groupSize ?? ""}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  patch(
                    "groupSize",
                    Number.isFinite(n) && n >= 1 ? Math.round(n) : null,
                  );
                }}
                className="h-9"
              />
            </label>
            <label className="block flex-1 space-y-1">
              <span className="text-[11px] text-[var(--muted)]">Budget ¢</span>
              <Input
                type="number"
                min={0}
                value={criteria.budgetCents ?? ""}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  patch(
                    "budgetCents",
                    Number.isFinite(n) && n >= 0 ? Math.round(n) : null,
                  );
                }}
                className="h-9"
                placeholder="optional"
              />
            </label>
          </div>
          <Button
            type="button"
            className="w-full"
            disabled={busy}
            onClick={onBuildPlan}
          >
            {busy ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
                Building plan…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" aria-hidden />
                Build suggested plan
              </>
            )}
          </Button>
        </div>

        {plan.followUps.length > 0 && (
          <ul className="space-y-1 text-[11px] text-[var(--muted)]">
            {plan.followUps.map((f) => (
              <li key={`${f.field}-${f.question}`}>• {f.question}</li>
            ))}
          </ul>
        )}

        {error && (
          <p className="rounded-lg bg-red-50 px-2.5 py-2 text-xs text-red-800">
            {error}
          </p>
        )}

        {plan.status === "empty" && plan.emptyReason && (
          <p className="text-xs text-[var(--muted)]">{plan.emptyReason}</p>
        )}

        {plan.options.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
              Catalog options ({plan.dataSourceLabel})
            </p>
            <ul className="space-y-2">
              {plan.options.map((opt) => {
                const selected = plan.selectedOptionId === opt.id;
                return (
                  <li key={opt.id}>
                    <button
                      type="button"
                      onClick={() => onSelectOption(opt)}
                      className={`w-full rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${
                        selected
                          ? "border-[var(--accent)] bg-[var(--accent)]/10"
                          : "border-[var(--border)] bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)]"
                      }`}
                    >
                      <p className="text-sm font-semibold">{opt.name}</p>
                      <p className="flex items-center gap-1 text-[11px] text-[var(--muted)]">
                        <MapPin className="h-3 w-3" aria-hidden />
                        {opt.kind} · {opt.locationLabel}
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {opt.reasons.slice(0, 2).map((r) => (
                          <li
                            key={`${opt.id}-${r.code}-${r.label}`}
                            className="text-[10px] text-[var(--foreground)]/80"
                          >
                            • {r.label}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-1 text-[10px] italic text-[var(--muted)]">
                        {opt.availabilityNote}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {plan.status === "suggested" && (
          <div className="space-y-2 border-t border-[var(--border)] pt-3">
            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
              Share as community post
            </p>
            <textarea
              value={draftMessage || plan.draftShareMessage || ""}
              onChange={(e) => setDraftMessage(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2 text-xs leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            />
            {!signedIn ? (
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={onRequestSignIn}
              >
                Sign in to share
              </Button>
            ) : (
              <Button
                type="button"
                className="w-full"
                disabled={shareBusy}
                onClick={() =>
                  onShare(draftMessage || plan.draftShareMessage || "")
                }
              >
                {shareBusy ? "Sharing…" : "Share plan as community post"}
              </Button>
            )}
            {shareNote && (
              <p className="text-[11px] text-[var(--muted)]">{shareNote}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
