"use client";

import { useEffect, useState } from "react";
import type { EvidenceSummary } from "@/types/evidence-summary";
import type { EventEntity, PlaceEntity } from "@/types/map-entities";
import { buildEvidenceSummaryForEntity } from "@/lib/reviews/evidence-summary";

type Props = {
  entity: EventEntity | PlaceEntity;
};

/**
 * Evidence-grounded summary block for detail cards.
 * Uses local deterministic summary immediately; optionally refreshes from API cache.
 */
export function EvidenceSummaryPanel({ entity }: Props) {
  const [summary, setSummary] = useState<EvidenceSummary>(() =>
    buildEvidenceSummaryForEntity(entity),
  );
  const [fromCache, setFromCache] = useState(false);

  useEffect(() => {
    setSummary(buildEvidenceSummaryForEntity(entity));
    setFromCache(false);
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/evidence-summary?entityId=${encodeURIComponent(entity.id)}`,
        );
        const json = (await res.json()) as {
          ok?: boolean;
          summary?: EvidenceSummary;
          cached?: boolean;
        };
        if (cancelled || !res.ok || !json.ok || !json.summary) return;
        // Only accept if same entity — never swap in another activity's evidence.
        if (json.summary.entityId !== entity.id) return;
        setSummary(json.summary);
        setFromCache(Boolean(json.cached));
      } catch {
        // Local rules summary already shown.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entity]);

  const hasThemes =
    summary.positiveThemes.length +
      summary.concernThemes.length +
      summary.practicalDetails.length >
    0;

  return (
    <section
      className="mt-5 rounded-lg border border-neutral-800 bg-white/5 p-3"
      aria-label="Evidence summary"
    >
      <h3 className="text-sm font-semibold text-white">Evidence summary</h3>
      <p className="mt-1 text-[10px] leading-snug text-neutral-500">
        {summary.limitation}
        {fromCache ? " · cached until source reviews change." : ""}
      </p>

      {summary.listingAggregate && (
        <p className="mt-2 text-xs text-neutral-300">
          <span className="font-medium text-white">Listing fact:</span>{" "}
          {summary.listingAggregate.rating.toFixed(1)} aggregate ·{" "}
          {summary.listingAggregate.reviewCount} reviews (count only — no
          review text available)
        </p>
      )}

      {summary.listingFacts.length > 0 && (
        <div className="mt-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-500">
            From the listing (facts)
          </p>
          <ul className="mt-1 space-y-0.5 text-xs text-neutral-300">
            {summary.listingFacts.map((f) => (
              <li key={f.label}>
                <span className="text-neutral-400">{f.label}:</span> {f.value}
              </li>
            ))}
          </ul>
        </div>
      )}

      {summary.status === "insufficient" ? (
        <p className="mt-3 text-sm text-neutral-400" role="status">
          {summary.emptyReason ?? "Not enough feedback to summarize"}
        </p>
      ) : (
        <>
          <p className="mt-2 text-[11px] text-neutral-400">
            Summarized {summary.sourceCount} review
            {summary.sourceCount === 1 ? "" : "s"}
            {summary.dateRange
              ? ` · ${new Date(summary.dateRange.earliest).toLocaleDateString()} – ${new Date(summary.dateRange.latest).toLocaleDateString()}`
              : ""}
          </p>

          {hasThemes && (
            <div className="mt-3 space-y-3">
              <ThemeGroup
                title="Recurring positives"
                items={summary.positiveThemes}
              />
              <ThemeGroup
                title="Recurring concerns"
                items={summary.concernThemes}
              />
              <ThemeGroup
                title="Practical details"
                items={summary.practicalDetails}
              />
            </div>
          )}

          {summary.sourceRefs.length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-500">
                Source records
              </p>
              <ul className="mt-1 max-h-32 space-y-1 overflow-y-auto text-[11px] text-neutral-400">
                {summary.sourceRefs.map((ref) => (
                  <li
                    key={ref.id}
                    className="rounded border border-neutral-800 px-2 py-1"
                  >
                    <span className="text-neutral-300">
                      {ref.authorName ?? "Reviewer"}
                      {ref.rating != null ? ` · ${ref.rating}★` : ""}
                    </span>
                    <span className="text-neutral-600"> · {ref.id}</span>
                    {ref.excerpt ? (
                      <p className="mt-0.5 text-neutral-500">“{ref.excerpt}”</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <p className="mt-3 text-[10px] text-neutral-600">
        Paraphrases are keyword-based restatements of source excerpts — not
        claims about safety, accessibility, hours, or availability beyond what
        reviews explicitly support.
      </p>
    </section>
  );
}

function ThemeGroup({
  title,
  items,
}: {
  title: string;
  items: EvidenceSummary["positiveThemes"];
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-500">
        {title}
      </p>
      <ul className="mt-1 space-y-1.5">
        {items.map((t) => (
          <li
            key={t.theme}
            className="rounded-lg border border-neutral-800 px-2.5 py-1.5 text-xs text-neutral-300"
          >
            <span className="font-semibold text-white">{t.label}</span>
            <span className="text-neutral-500">
              {" "}
              · {t.reviewIds.length} source
              {t.reviewIds.length === 1 ? "" : "s"}
            </span>
            <p className="mt-0.5 text-neutral-400">
              <span className="text-neutral-500">Paraphrase:</span>{" "}
              {t.paraphrase}
            </p>
            {t.excerpts[0] && (
              <p className="mt-0.5 text-neutral-500">“{t.excerpts[0]}”</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
