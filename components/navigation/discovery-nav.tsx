"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import {
  Search,
  SlidersHorizontal,
  Filter,
  Sparkles,
  UserRound,
  MessagesSquare,
  MessageCircle,
  LoaderCircle,
  CalendarDays,
} from "lucide-react";
import { TrailmapMark } from "@/components/brand/trailmap-mark";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  PromptChips,
  type DiscoverySuggestion,
} from "@/components/ui/prompt-chips";
import { CATEGORY_OPTIONS } from "@/lib/data/map-entities";
import { cn } from "@/lib/utils";
import type { CategoryFilter, EntityKind } from "@/types/map-entities";

interface DiscoveryNavProps {
  search: string;
  category: CategoryFilter;
  kinds: EntityKind[];
  dataSourceLabel: string;
  forYouOnly: boolean;
  /** Pins currently on the map after filters. */
  visibleCount?: number;
  /** Loaded catalog size before For You / distance trim. */
  loadedCount?: number;
  /** Map catalog is reloading after a filter change. */
  searching?: boolean;
  /** Filter query returned no pins. */
  emptyResults?: boolean;
  profileLabel?: string | null;
  onSearchChange: (value: string) => void;
  onCategoryChange: (value: CategoryFilter) => void;
  onKindsChange: (kinds: EntityKind[]) => void;
  onSuggestionApply: (suggestion: DiscoverySuggestion) => void;
  /** Run deterministic NL match against the catalog (not an LLM). */
  onNlMatch: (message: string) => void;
  nlBusy?: boolean;
  /** Open meetup planner for the current search text. */
  onPlanMeetup: (message: string) => void;
  planBusy?: boolean;
  onOpenPreferences: () => void;
  onOpenProfile: () => void;
  onOpenCommunity: () => void;
  onOpenMessages: () => void;
  onForYouOnlyChange: (value: boolean) => void;
  /** Soft ranking highlights on map / For You panel. */
  personalizationEnabled?: boolean;
  onPersonalizationEnabledChange?: (value: boolean) => void;
  onResetPersonalizationView?: () => void;
}

const KIND_TOGGLES: { id: EntityKind; label: string }[] = [
  { id: "place", label: "Places" },
  { id: "event", label: "Events" },
  { id: "person", label: "People" },
];

export function DiscoveryNav({
  search,
  category,
  kinds,
  dataSourceLabel,
  forYouOnly,
  visibleCount,
  loadedCount,
  searching = false,
  emptyResults = false,
  profileLabel,
  onSearchChange,
  onCategoryChange,
  onKindsChange,
  onSuggestionApply,
  onNlMatch,
  nlBusy = false,
  onPlanMeetup,
  planBusy = false,
  onOpenPreferences,
  onOpenProfile,
  onOpenCommunity,
  onOpenMessages,
  onForYouOnlyChange,
  personalizationEnabled = true,
  onPersonalizationEnabledChange,
  onResetPersonalizationView,
}: DiscoveryNavProps) {
  function toggleKind(kind: EntityKind) {
    if (kinds.includes(kind)) {
      if (kinds.length === 1) return;
      onKindsChange(kinds.filter((k) => k !== kind));
    } else {
      onKindsChange([...kinds, kind]);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    // Filters already apply live; submit confirms intent and blurs the field.
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
  }

  return (
    <header className="pointer-events-auto absolute left-3 right-3 top-3 z-30 sm:left-4 sm:right-auto sm:w-[380px]">
      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]/95 shadow-[var(--shadow-panel)] backdrop-blur-md">
        <div
          className="border-b border-[var(--border)] px-4 py-3"
          style={{
            background:
              "linear-gradient(120deg, var(--brand-deep) 0%, var(--brand-mid) 55%, var(--brand-mist) 100%)",
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Link
                href="/"
                className="inline-flex items-center gap-2 font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-white hover:opacity-90"
              >
                <TrailmapMark className="h-8 w-8" />
                Trailmap
              </Link>
              <p className="text-xs text-white/80">
                Discover places, events & people on the map
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                variant="secondary"
                size="icon"
                aria-label="Open community posts"
                title="Community posts"
                onClick={onOpenCommunity}
                className="border-white/20 bg-white/15 text-white transition-transform hover:bg-white/25 active:scale-95"
              >
                <MessagesSquare className="h-4 w-4" />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                aria-label="Open private messages"
                title="Messages"
                onClick={onOpenMessages}
                className="border-white/20 bg-white/15 text-white transition-transform hover:bg-white/25 active:scale-95"
              >
                <MessageCircle className="h-4 w-4" />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                aria-label="Open your profile"
                title={
                  profileLabel ? `Profile · ${profileLabel}` : "Sign in / profile"
                }
                onClick={onOpenProfile}
                className="border-white/20 bg-white/15 text-white transition-transform hover:bg-white/25 active:scale-95"
              >
                <UserRound className="h-4 w-4" />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                aria-label="Open discovery preferences"
                title="Preferences (saved locally in this browser)"
                onClick={onOpenPreferences}
                className="border-white/20 bg-white/15 text-white transition-transform hover:bg-white/25 active:scale-95"
              >
                <SlidersHorizontal className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-3 p-3">
          <div className="space-y-2">
            <h2 className="font-[family-name:var(--font-display)] text-base font-semibold tracking-tight text-[var(--foreground)]">
              What do you want to do?
            </h2>
            <form onSubmit={handleSubmit} className="space-y-2">
              <div className="flex gap-2">
                <label className="relative min-w-0 flex-1">
                  <span className="sr-only">Search map</span>
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]"
                    aria-hidden
                  />
                  <Input
                    value={search}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder="Find badminton players this weekend, discover hiking trails, or explore nearby events…"
                    className="h-11 rounded-xl border-[var(--border)] bg-[var(--surface-elevated)] pl-9 pr-3 text-sm shadow-inner transition-[box-shadow,border-color] placeholder:text-[11px] placeholder:leading-tight focus-visible:border-[var(--ring)] focus-visible:shadow-sm sm:placeholder:text-xs"
                    autoComplete="off"
                    aria-busy={searching}
                    aria-describedby="search-status"
                  />
                </label>
                <Button
                  type="submit"
                  size="default"
                  className="h-11 shrink-0 rounded-xl px-3"
                  aria-label="Apply keyword filter to map"
                  title="Keyword filter"
                >
                  {searching ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Search className="h-4 w-4" aria-hidden />
                  )}
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <Button
                  type="button"
                  variant="secondary"
                  className="h-9 rounded-xl text-[11px]"
                  disabled={nlBusy || !search.trim()}
                  onClick={() => onNlMatch(search.trim())}
                >
                  {nlBusy ? (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" aria-hidden />
                  )}
                  NL match
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-9 rounded-xl text-[11px]"
                  disabled={planBusy || !search.trim()}
                  onClick={() => onPlanMeetup(search.trim())}
                >
                  {planBusy ? (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                  )}
                  Plan meetup
                </Button>
              </div>
              <p
                id="search-status"
                className="min-h-[1rem] text-[10px] leading-snug text-[var(--muted)]"
                role="status"
                aria-live="polite"
              >
                {nlBusy
                  ? "Parsing request with deterministic rules…"
                  : searching
                    ? "Updating map results…"
                    : emptyResults
                      ? "No matches on the map — try another search or clear filters."
                      : search.trim()
                        ? "Keyword filter stays on-device. Use Natural-language match for structured catalog search (rules parser, not an LLM)."
                        : "Keyword filter or Natural-language match — no LLM is configured."}
              </p>
            </form>
            <PromptChips
              hidden={search.trim().length > 0}
              onSelect={onSuggestionApply}
              label="Suggestions"
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[var(--muted)]">
              <Filter className="h-3.5 w-3.5" aria-hidden />
              Category
            </div>
            <div
              className="flex gap-1.5 overflow-x-auto pb-1"
              role="listbox"
              aria-label="Category filters"
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={category === opt.value}
                  onClick={() => onCategoryChange(opt.value)}
                  className={cn(
                    "shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-[var(--motion-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                    category === opt.value
                      ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                      : "bg-[var(--surface-elevated)] text-[var(--foreground)] hover:bg-[var(--surface-hover)]",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div
            className="flex flex-wrap gap-1.5"
            role="group"
            aria-label="Entity types"
          >
            {KIND_TOGGLES.map((item) => {
              const active = kinds.includes(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleKind(item.id)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors duration-[var(--motion-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                    active
                      ? "border-transparent text-white"
                      : "border-[var(--border)] bg-transparent text-[var(--muted)]",
                  )}
                  style={
                    active
                      ? {
                          backgroundColor: `var(--marker-${item.id === "place" ? "place" : item.id === "event" ? "event" : "person"})`,
                        }
                      : undefined
                  }
                >
                  {item.label}
                </button>
              );
            })}
            <button
              type="button"
              aria-pressed={forYouOnly}
              disabled={!personalizationEnabled}
              onClick={() => onForYouOnlyChange(!forYouOnly)}
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors duration-[var(--motion-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50",
                forYouOnly
                  ? "border-transparent bg-[var(--accent)] text-[var(--accent-foreground)]"
                  : "border-[var(--border)] text-[var(--muted)]",
              )}
            >
              <Sparkles className="h-3 w-3" aria-hidden />
              For you
            </button>
            {onPersonalizationEnabledChange && (
              <button
                type="button"
                aria-pressed={personalizationEnabled}
                title="Toggle soft ranking highlights (filters stay authoritative)"
                onClick={() =>
                  onPersonalizationEnabledChange(!personalizationEnabled)
                }
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                  personalizationEnabled
                    ? "border-[var(--border)] text-[var(--foreground)]"
                    : "border-[var(--border)] text-[var(--muted)]",
                )}
              >
                {personalizationEnabled ? "Ranked pins on" : "Ranked pins off"}
              </button>
            )}
            {onResetPersonalizationView && (
              <button
                type="button"
                onClick={onResetPersonalizationView}
                className="rounded-md border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                Reset view
              </button>
            )}
          </div>

          <p
            key={`${visibleCount}-${search}-${category}-${personalizationEnabled}`}
            className="discovery-fade-in text-[10px] leading-snug text-[var(--muted)]"
          >
            Data source: {dataSourceLabel}
            {typeof visibleCount === "number" &&
            typeof loadedCount === "number" ? (
              <>
                <br />
                Showing {visibleCount} on map
                {loadedCount !== visibleCount
                  ? ` · ${loadedCount} loaded (search/NL keep matches; distance only when idle)`
                  : null}
              </>
            ) : null}
            {!personalizationEnabled ? (
              <>
                <br />
                Personalization off — manual filters only.
              </>
            ) : null}
          </p>
        </div>
      </div>
    </header>
  );
}
