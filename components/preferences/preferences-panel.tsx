"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEMO_STARTING_POINT } from "@/lib/preferences/defaults";
import { CATEGORY_OPTIONS } from "@/lib/data/map-entities";
import { geocodePlaceName } from "@/lib/location/geocode-place";
import { cn } from "@/lib/utils";
import type { ActivityCategory } from "@/types/map-entities";
import type {
  DayOfWeek,
  SkillPreference,
  UserPreferences,
} from "@/types/preferences";
import { X } from "lucide-react";

const DAYS: { id: DayOfWeek; label: string }[] = [
  { id: "mon", label: "Mon" },
  { id: "tue", label: "Tue" },
  { id: "wed", label: "Wed" },
  { id: "thu", label: "Thu" },
  { id: "fri", label: "Fri" },
  { id: "sat", label: "Sat" },
  { id: "sun", label: "Sun" },
];

const SKILLS: { id: SkillPreference; label: string }[] = [
  { id: "any", label: "Any" },
  { id: "beginner", label: "Beginner" },
  { id: "intermediate", label: "Intermediate" },
  { id: "advanced", label: "Advanced" },
];

interface PreferencesPanelProps {
  open: boolean;
  preferences: UserPreferences;
  onChange: (next: UserPreferences) => void;
  onClose: () => void;
  onSave: () => void;
  /** Fired when user Sets a city / uses my location — parent should save + auto-fetch. */
  onLocationApplied?: (next: UserPreferences) => void;
  /** Clear save/like/dismiss personalization history. */
  onClearPersonalization?: () => void;
  personalizationCount?: number;
}

function StartingLocationSection({
  preferences,
  onChange,
  onLocationApplied,
}: {
  preferences: UserPreferences;
  onChange: (next: UserPreferences) => void;
  onLocationApplied?: (next: UserPreferences) => void;
}) {
  const [query, setQuery] = useState(
    preferences.locationSource === "browser"
      ? ""
      : preferences.startingPointLabel || "",
  );
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (preferences.locationSource === "browser") {
      setQuery("");
      return;
    }
    setQuery(preferences.startingPointLabel || "");
  }, [preferences.locationSource, preferences.startingPointLabel]);

  async function applyPlaceSearch() {
    setBusy(true);
    setStatus("Looking up place…");
    const result = await geocodePlaceName(query);
    setBusy(false);
    if (!result.ok) {
      setStatus(result.error);
      return;
    }
    const next: UserPreferences = {
      ...preferences,
      startingPoint: { lat: result.lat, lng: result.lng },
      startingPointLabel: result.label,
      locationSource: "manual",
    };
    onChange(next);
    onLocationApplied?.(next);
    setQuery(result.label);
    setStatus(`Fetching events near ${result.label}…`);
  }

  return (
    <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-3">
      <p className="font-medium">Starting location</p>
      <p className="text-xs text-[var(--muted)]">
        Search a city and tap Set — events for that place fetch automatically
        (all scrapers). No curl needed. Browser location is approximate.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => {
            void (async () => {
              setBusy(true);
              setStatus("Getting browser location…");
              const { requestBrowserLocation } = await import(
                "@/lib/location/browser-geolocation"
              );
              const loc = await requestBrowserLocation();
              setBusy(false);
              if (!loc.ok) {
                setStatus(loc.reason);
                return;
              }
              const next: UserPreferences = {
                ...preferences,
                startingPoint: loc.point,
                startingPointLabel: loc.label,
                locationSource: "browser",
              };
              onChange(next);
              onLocationApplied?.(next);
              setQuery("");
              setStatus(`Fetching events near you…`);
            })();
          }}
        >
          Use my location
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => {
            const next: UserPreferences = {
              ...preferences,
              startingPoint: {
                lat: DEMO_STARTING_POINT.lat,
                lng: DEMO_STARTING_POINT.lng,
              },
              startingPointLabel: DEMO_STARTING_POINT.label,
              locationSource: "demo",
            };
            onChange(next);
            onLocationApplied?.(next);
            setQuery(DEMO_STARTING_POINT.label);
            setStatus(DEMO_STARTING_POINT.label);
          }}
        >
          Use demo SF pin
        </Button>
      </div>

      <label className="block space-y-1">
        <span className="text-xs">Check another location</span>
        <div className="flex gap-2">
          <Input
            type="text"
            placeholder="City or place — e.g. Oakland, CA"
            value={query}
            disabled={busy}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void applyPlaceSearch();
              }
            }}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="shrink-0"
            disabled={busy || query.trim().length < 2}
            onClick={() => void applyPlaceSearch()}
          >
            Set
          </Button>
        </div>
      </label>

      <p className="text-[11px] text-[var(--muted)]">
        {status ??
          preferences.startingPointLabel ??
          "No starting point yet"}
      </p>
    </div>
  );
}

export function PreferencesPanel({
  open,
  preferences,
  onChange,
  onClose,
  onSave,
  onLocationApplied,
  onClearPersonalization,
  personalizationCount = 0,
}: PreferencesPanelProps) {
  if (!open) return null;

  function toggleDay(day: DayOfWeek) {
    const has = preferences.availableDays.includes(day);
    onChange({
      ...preferences,
      availableDays: has
        ? preferences.availableDays.filter((d) => d !== day)
        : [...preferences.availableDays, day],
    });
  }

  function toggleCategory(category: ActivityCategory) {
    const has = preferences.preferredCategories.includes(category);
    onChange({
      ...preferences,
      preferredCategories: has
        ? preferences.preferredCategories.filter((c) => c !== category)
        : [...preferences.preferredCategories, category],
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="prefs-title"
    >
      <button
        type="button"
        className="discovery-backdrop absolute inset-0"
        aria-label="Close preferences"
        onClick={onClose}
      />
      <div className="discovery-slide-up relative z-10 flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-panel)] sm:rounded-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface-elevated)]/60 p-4">
          <div>
            <h2
              id="prefs-title"
              className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight"
            >
              Discovery preferences
            </h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Saved in this browser only (local demo). Not stored in Supabase.
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </Button>
        </header>

        <div className="space-y-5 overflow-y-auto p-4 text-sm">
          <label className="block space-y-1.5">
            <span className="font-medium">Max budget (USD)</span>
            <Input
              type="number"
              min={0}
              step={1}
              value={
                preferences.maxBudgetCents == null
                  ? ""
                  : preferences.maxBudgetCents / 100
              }
              onChange={(e) => {
                const v = e.target.value;
                onChange({
                  ...preferences,
                  maxBudgetCents:
                    v.trim() === "" ? null : Math.max(0, Number(v) * 100),
                });
              }}
              placeholder="Leave blank for no budget cap"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="font-medium">
              Max travel distance ({preferences.maxDistanceKm} km)
            </span>
            <input
              type="range"
              min={5}
              max={80}
              value={preferences.maxDistanceKm}
              onChange={(e) =>
                onChange({
                  ...preferences,
                  maxDistanceKm: Number(e.target.value),
                })
              }
              className="w-full accent-[var(--accent)]"
            />
          </label>

          <fieldset>
            <legend className="mb-2 font-medium">Available days</legend>
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((d) => {
                const on = preferences.availableDays.includes(d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleDay(d.id)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                      on
                        ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                        : "bg-[var(--surface-elevated)]",
                    )}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1.5">
              <span className="font-medium">Earliest hour (UTC)</span>
              <Input
                type="number"
                min={0}
                max={23}
                value={preferences.timeWindow.startHour}
                onChange={(e) =>
                  onChange({
                    ...preferences,
                    timeWindow: {
                      ...preferences.timeWindow,
                      startHour: Number(e.target.value),
                    },
                  })
                }
              />
            </label>
            <label className="space-y-1.5">
              <span className="font-medium">Latest hour (UTC)</span>
              <Input
                type="number"
                min={0}
                max={23}
                value={preferences.timeWindow.endHour}
                onChange={(e) =>
                  onChange({
                    ...preferences,
                    timeWindow: {
                      ...preferences.timeWindow,
                      endHour: Number(e.target.value),
                    },
                  })
                }
              />
            </label>
          </div>

          <fieldset>
            <legend className="mb-2 font-medium">Preferred activities</legend>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORY_OPTIONS.filter((c) => c.value !== "all").map((c) => {
                const on = preferences.preferredCategories.includes(
                  c.value as ActivityCategory,
                );
                return (
                  <button
                    key={c.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleCategory(c.value as ActivityCategory)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                      on
                        ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                        : "bg-[var(--surface-elevated)]",
                    )}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 font-medium">Skill preference</legend>
            <div className="flex flex-wrap gap-1.5">
              {SKILLS.map((s) => {
                const on = preferences.skillPreference === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      onChange({ ...preferences, skillPreference: s.id })
                    }
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                      on
                        ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                        : "bg-[var(--surface-elevated)]",
                    )}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <StartingLocationSection
            preferences={preferences}
            onChange={onChange}
            onLocationApplied={onLocationApplied}
          />

          {onClearPersonalization && (
            <fieldset className="rounded-lg border border-[var(--border)] p-3">
              <legend className="px-1 font-medium">Personalization</legend>
              <p className="mb-2 text-xs leading-snug text-[var(--muted)]">
                Saves, likes, and dismissals softly adjust rankings with rules
                (not a trained model). They never override your budget,
                distance, schedule, or skill limits.{" "}
                {personalizationCount > 0
                  ? `${personalizationCount} signal${personalizationCount === 1 ? "" : "s"} stored.`
                  : "No feedback yet — baseline recommender only."}
              </p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={personalizationCount === 0}
                onClick={onClearPersonalization}
              >
                Clear personalization data
              </Button>
            </fieldset>
          )}
        </div>

        <footer className="flex gap-2 border-t border-[var(--border)] p-4">
          <Button className="flex-1" onClick={onSave}>
            Save preferences
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </footer>
      </div>
    </div>
  );
}
