"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { CompatibilityMatch, CompatibilityResult } from "@/types/compatibility";
import { LoaderCircle, MessageCircle, Users } from "lucide-react";

type TeammatesPanelProps = {
  /** Auth user id — panel loads when signed in. */
  sessionUserId: string | null;
  selectedId: string | null;
  onSelectPersonId: (id: string) => void;
  onMessageUser: (peerId: string) => void;
  onRequestSignIn: () => void;
  /** Share ranked matches with map detail cards (explanations). */
  onMatchesLoaded?: (matches: CompatibilityMatch[]) => void;
};

type ApiOk = CompatibilityResult & {
  ok: true;
  viewerHints?: {
    hasInterests: boolean;
    hasAvailability: boolean;
    hasArea: boolean;
    discoverable: boolean;
  };
};

export function TeammatesPanel({
  sessionUserId,
  selectedId,
  onSelectPersonId,
  onMessageUser,
  onRequestSignIn,
  onMatchesLoaded,
}: TeammatesPanelProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApiOk | null>(null);

  const load = useCallback(async () => {
    if (!sessionUserId) {
      setResult(null);
      setError(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/compatibility");
      const json = (await res.json()) as
        | ApiOk
        | { ok: false; error: string };
      if (!res.ok || !json.ok) {
        setResult(null);
        setError(
          !json.ok
            ? json.error
            : res.status === 401
              ? "Sign in to see compatible teammates"
              : "Could not load compatibility",
        );
        return;
      }
      setResult(json);
      onMatchesLoaded?.(json.matches);
    } catch {
      setError("Could not reach compatibility service");
      setResult(null);
      onMatchesLoaded?.([]);
    } finally {
      setBusy(false);
    }
  }, [sessionUserId, onMatchesLoaded]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <aside
      className="hidden w-[300px] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]/95 shadow-xl backdrop-blur md:block"
      aria-label="Compatible teammates"
    >
      <div className="border-b border-[var(--border)] px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <Users className="h-4 w-4 text-[var(--accent)]" aria-hidden />
          Compatible teammates
        </div>
        <p className="mt-0.5 text-[10px] leading-snug text-[var(--muted)]">
          Shared interests, stated availability, skill, and approximate area —
          only discoverable profiles.
        </p>
      </div>

      {!sessionUserId ? (
        <div className="space-y-2 p-3">
          <p className="text-xs text-[var(--muted)]">
            Sign in and fill interests / availability on your profile to see
            real matches. Demo map pins are not used as production results.
          </p>
          <Button type="button" size="sm" className="w-full" onClick={onRequestSignIn}>
            Sign in
          </Button>
        </div>
      ) : busy ? (
        <p className="flex items-center gap-2 p-3 text-xs text-[var(--muted)]">
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Ranking discoverable profiles…
        </p>
      ) : error ? (
        <div className="space-y-2 p-3">
          <p className="text-xs text-[var(--muted)]">{error}</p>
          <Button type="button" size="sm" variant="secondary" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      ) : result && result.matches.length === 0 ? (
        <p className="p-3 text-xs text-[var(--muted)]">
          {result.emptyReason}
          {result.viewerHints && !result.viewerHints.hasInterests
            ? " Add interests on your profile to improve matches."
            : null}
        </p>
      ) : result ? (
        <ul className="max-h-72 overflow-y-auto p-2">
          {result.matches.map((m: CompatibilityMatch) => (
            <li key={m.id} className="mb-1">
              <div
                className={`rounded-lg px-2 py-2 ${
                  selectedId === m.id
                    ? "bg-[var(--accent)]/10"
                    : "hover:bg-[var(--surface-hover)]"
                }`}
              >
                <button
                  type="button"
                  className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  onClick={() => onSelectPersonId(m.id)}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-medium leading-snug">
                      {m.displayName}
                    </p>
                    <span className="shrink-0 text-[10px] font-semibold text-[var(--accent)]">
                      {m.scorePercent}%
                    </span>
                  </div>
                  {m.city && (
                    <p className="text-[10px] text-[var(--muted)]">{m.city}</p>
                  )}
                  {m.reasons[0] && (
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-[var(--muted)]">
                      {m.reasons[0].label}
                    </p>
                  )}
                </button>
                {m.acceptsMessages && (
                  <button
                    type="button"
                    className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-[var(--accent)] hover:underline"
                    onClick={() => onMessageUser(m.id)}
                  >
                    <MessageCircle className="h-3 w-3" aria-hidden />
                    Message
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </aside>
  );
}
