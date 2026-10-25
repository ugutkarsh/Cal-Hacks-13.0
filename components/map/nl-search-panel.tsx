"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { EntityKind } from "@/types/map-entities";
import type {
  NlSearchCriteria,
  NlSearchMatch,
  NlSearchResponse,
} from "@/types/nl-search";
import { LoaderCircle, Sparkles, X } from "lucide-react";

const KIND_OPTS: { id: EntityKind; label: string }[] = [
  { id: "event", label: "Events" },
  { id: "place", label: "Places" },
  { id: "person", label: "People" },
];

type NlSearchPanelProps = {
  open: boolean;
  busy: boolean;
  error: string | null;
  result: NlSearchResponse | null;
  onClose: () => void;
  onConfirmSearch: (criteria: NlSearchCriteria) => void;
  onSelectMatch: (match: NlSearchMatch) => void;
  onClearMatches: () => void;
};

export function NlSearchPanel({
  open,
  busy,
  error,
  result,
  onClose,
  onConfirmSearch,
  onSelectMatch,
  onClearMatches,
}: NlSearchPanelProps) {
  const [draft, setDraft] = useState<NlSearchCriteria | null>(null);

  const criteria = draft ?? result?.criteria ?? null;

  if (!open || !result) return null;

  function update<K extends keyof NlSearchCriteria>(
    key: K,
    value: NlSearchCriteria[K],
  ) {
    if (!criteria) return;
    setDraft({ ...criteria, [key]: value });
  }

  function toggleKind(kind: EntityKind) {
    if (!criteria) return;
    const has = criteria.kinds.includes(kind);
    const next = has
      ? criteria.kinds.filter((k) => k !== kind)
      : [...criteria.kinds, kind];
    update("kinds", next.length ? next : criteria.kinds);
  }

  return (
    <div
      className="pointer-events-auto absolute bottom-4 left-3 right-3 z-40 max-h-[48dvh] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]/97 shadow-[var(--shadow-panel)] backdrop-blur-md sm:left-4 sm:right-auto sm:w-[380px]"
      role="region"
      aria-label="Natural-language match"
    >
      <div className="flex items-start justify-between gap-2 border-b border-[var(--border)] bg-[var(--surface-elevated)]/70 px-3 py-2.5">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold text-[var(--foreground)]">
            <Sparkles className="h-3.5 w-3.5 text-[var(--accent)]" aria-hidden />
            Natural-language match
          </p>
          <p className="mt-0.5 text-[10px] text-[var(--muted)]">
            Deterministic rules parser — not an LLM.{" "}
            {result.dataSourceLabel}
          </p>
        </div>
        <button
          type="button"
          className="rounded-full p-1.5 hover:bg-[var(--surface-hover)]"
          aria-label="Close match panel"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="max-h-[40dvh] space-y-3 overflow-y-auto p-3">
        {result.limitation && (
          <p className="rounded-lg bg-[var(--surface-elevated)] px-2.5 py-1.5 text-[10px] leading-snug text-[var(--muted)]">
            {result.limitation}
          </p>
        )}

        {result.reviewNotes.length > 0 && (
          <ul className="space-y-1 text-[11px] text-[var(--muted)]">
            {result.reviewNotes.map((note) => (
              <li key={note}>• {note}</li>
            ))}
          </ul>
        )}

        {criteria && (
          <div className="space-y-2">
            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
              Review criteria
            </p>
            <label className="block space-y-1">
              <span className="text-[11px] text-[var(--muted)]">Activity</span>
              <Input
                value={criteria.activity ?? ""}
                onChange={(e) =>
                  update("activity", e.target.value.trim() || null)
                }
                placeholder="e.g. hiking"
                className="h-9"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] text-[var(--muted)]">City</span>
              <Input
                value={criteria.city ?? ""}
                onChange={(e) => update("city", e.target.value.trim() || null)}
                placeholder="e.g. San Francisco"
                className="h-9"
              />
            </label>
            <div className="flex flex-wrap gap-1.5">
              {KIND_OPTS.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  aria-pressed={criteria.kinds.includes(k.id)}
                  onClick={() => toggleKind(k.id)}
                  className={cn(
                    "rounded-md border px-2 py-1 text-[11px] font-medium",
                    criteria.kinds.includes(k.id)
                      ? "border-transparent bg-[var(--accent)] text-[var(--accent-foreground)]"
                      : "border-[var(--border)] text-[var(--muted)]",
                  )}
                >
                  {k.label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-[11px] text-[var(--foreground)]">
              <input
                type="checkbox"
                checked={criteria.useNearMe}
                onChange={(e) => update("useNearMe", e.target.checked)}
              />
              Use saved starting point (near me)
            </label>
            <Button
              type="button"
              className="w-full"
              disabled={busy}
              onClick={() => {
                setDraft(null);
                onConfirmSearch(criteria);
              }}
            >
              {busy ? (
                <>
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
                  Searching catalog…
                </>
              ) : (
                "Search catalog"
              )}
            </Button>
          </div>
        )}

        {error && (
          <p className="rounded-lg bg-red-50 px-2.5 py-2 text-xs text-red-800">
            {error}
          </p>
        )}

        {result.searched && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
                Matches ({result.matches.length})
              </p>
              <button
                type="button"
                className="text-[10px] text-[var(--accent)] underline"
                onClick={onClearMatches}
              >
                Clear highlight
              </button>
            </div>
            {result.emptyReason && (
              <p className="text-xs text-[var(--muted)]">{result.emptyReason}</p>
            )}
            <ul className="space-y-2">
              {result.matches.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => onSelectMatch(m)}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2 text-left transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  >
                    <p className="text-sm font-semibold text-[var(--foreground)]">
                      {m.name}
                    </p>
                    <p className="text-[11px] text-[var(--muted)]">
                      {m.kind} · {m.locationLabel}
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {m.reasons.slice(0, 3).map((r) => (
                        <li
                          key={`${m.id}-${r.code}-${r.label}`}
                          className="text-[10px] leading-snug text-[var(--foreground)]/80"
                        >
                          • {r.label}
                        </li>
                      ))}
                    </ul>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
