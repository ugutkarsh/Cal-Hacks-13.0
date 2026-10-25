"use client";

import { cn } from "@/lib/utils";
import type { CategoryFilter, EntityKind } from "@/types/map-entities";

export type DiscoverySuggestion = {
  label: string;
  /** Keyword filter only — never claims AI understanding. */
  search?: string;
  category?: CategoryFilter;
  kinds?: EntityKind[];
};

/** Compact chips for the discovery search area (map keyword + filter shortcuts). */
export const DISCOVERY_SEARCH_PROMPTS: readonly DiscoverySuggestion[] = [
  { label: "Sports", category: "sports", search: "" },
  { label: "Outdoor", category: "outdoor", search: "" },
  { label: "This weekend", search: "weekend" },
  { label: "Meet people", kinds: ["person"], search: "" },
] as const;

interface PromptChipsProps {
  prompts?: readonly DiscoverySuggestion[];
  onSelect: (suggestion: DiscoverySuggestion) => void;
  /** Hide chips when the search box already has text. */
  hidden?: boolean;
  className?: string;
  label?: string;
}

/**
 * Example suggestion chips — apply keyword / category / kind filters only.
 * Does not invent results or claim an AI backend.
 */
export function PromptChips({
  prompts = DISCOVERY_SEARCH_PROMPTS,
  onSelect,
  hidden = false,
  className,
  label = "Suggestions",
}: PromptChipsProps) {
  if (hidden) return null;

  return (
    <div className={cn("space-y-1.5", className)}>
      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
        {label}
      </p>
      <div
        className="flex gap-1.5 overflow-x-auto pb-0.5"
        role="list"
        aria-label="Search suggestions"
      >
        {prompts.map((prompt) => (
          <button
            key={prompt.label}
            type="button"
            role="listitem"
            onClick={() => onSelect(prompt)}
            className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--surface-elevated)] px-2.5 py-1 text-[11px] font-medium text-[var(--foreground)] transition-[transform,background-color,box-shadow] duration-[var(--motion-fast)] ease-out hover:-translate-y-0.5 hover:bg-[var(--surface-hover)] hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] motion-reduce:transform-none"
          >
            {prompt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
