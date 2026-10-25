"use client";

import { Button } from "@/components/ui/button";
import { AlertCircle, Loader2, MapPinOff } from "lucide-react";

export function MapLoadingState() {
  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-[var(--brand-mist)]/40 backdrop-blur-[2px]"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4 shadow-lg">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--accent)]" />
        <p className="text-sm font-medium">Loading map discoveries…</p>
      </div>
    </div>
  );
}

export function MapEmptyState({
  onReset,
  title = "Nothing on the map",
  description = "No places, events, or people match your search and filters.",
  actionLabel = "Clear filters",
}: {
  onReset: () => void;
  title?: string;
  description?: string;
  actionLabel?: string;
}) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center p-6">
      <div className="max-w-sm rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center shadow-xl">
        <MapPinOff className="mx-auto mb-3 h-8 w-8 text-[var(--muted)]" />
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
          {title}
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">{description}</p>
        <Button className="mt-4" onClick={onReset}>
          {actionLabel}
        </Button>
      </div>
    </div>
  );
}

export function MapErrorState({
  message,
  onRetry,
  onUseDemo,
}: {
  message: string;
  onRetry: () => void;
  onUseDemo?: () => void;
}) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center p-6">
      <div className="max-w-sm rounded-xl border border-red-200 bg-[var(--surface)] p-6 text-center shadow-xl">
        <AlertCircle className="mx-auto mb-3 h-8 w-8 text-red-600" />
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
          Couldn’t load discoveries
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">{message}</p>
        <p className="mt-2 text-xs text-[var(--muted)]">
          Demo data was not loaded automatically. Retry Supabase or switch to
          labeled demo mode.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={onRetry}>Try again</Button>
          {onUseDemo && (
            <Button variant="secondary" onClick={onUseDemo}>
              Use demo data
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
