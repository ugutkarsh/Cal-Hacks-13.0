"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MARKER_META } from "@/components/map/marker-styles";
import { categoryLabel } from "@/lib/utils";
import type { MapEntity } from "@/types/map-entities";
import type { RecommendationReason } from "@/types/recommendations";
import { MapPin, Calendar, UserRound, Sparkles } from "lucide-react";

interface PreviewPostcardProps {
  entity: MapEntity;
  recommendationReasons?: RecommendationReason[];
  onOpenDetail: () => void;
  onClose: () => void;
  /** Emphasize the matching map pin while the card is hovered. */
  onHoverChange?: (hovered: boolean) => void;
}

function kindIcon(kind: MapEntity["kind"]) {
  if (kind === "event") return Calendar;
  if (kind === "person") return UserRound;
  return MapPin;
}

function kindBadgeVariant(
  kind: MapEntity["kind"],
): "place" | "event" | "person" {
  return kind;
}

function metaLine(entity: MapEntity): string | null {
  if (entity.kind === "event") {
    const when = entity.startsAt
      ? new Date(entity.startsAt).toLocaleString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : null;
    return when;
  }
  if (entity.kind === "place" && entity.rating != null) {
    return `${entity.rating.toFixed(1)} · ${entity.reviewCount} reviews`;
  }
  if (entity.kind === "person") {
    return entity.interests.slice(0, 3).map(categoryLabel).join(" · ") || null;
  }
  return null;
}

function skillBadge(entity: MapEntity): string | null {
  if (entity.kind !== "event") return null;
  const label = entity.difficultyLabel?.trim();
  if (!label || /^open to all$/i.test(label)) return null;
  return label;
}

export function PreviewPostcard({
  entity,
  recommendationReasons = [],
  onOpenDetail,
  onClose,
  onHoverChange,
}: PreviewPostcardProps) {
  const Icon = kindIcon(entity.kind);
  const accent = `var(${MARKER_META[entity.kind].cssVar})`;
  const secondary = metaLine(entity);
  const skill = skillBadge(entity);
  const explainable = recommendationReasons.filter(
    (r) =>
      r.code === "text_relevance" ||
      r.code === "interest_match" ||
      r.code === "within_budget" ||
      r.code === "within_distance" ||
      r.code === "schedule_fit" ||
      r.code === "skill_fit" ||
      r.code === "prior_positive_feedback" ||
      r.code === "similar_feedback_affinity" ||
      r.code === "search_intent_match",
  );

  const primaryLabel =
    entity.kind === "event"
      ? "View activity"
      : entity.kind === "person"
        ? "View profile"
        : "View place";

  return (
    <article
      className="discovery-rise discovery-card-selected discovery-hover-lift w-full max-w-sm overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]"
      style={{ ["--card-accent" as string]: accent }}
      aria-label={`Preview: ${entity.name}`}
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
      onFocusCapture={() => onHoverChange?.(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          onHoverChange?.(false);
        }
      }}
    >
      <div
        className="relative flex h-32 items-end overflow-hidden bg-[var(--surface-elevated)]"
        style={{
          backgroundImage:
            entity.imageUrl != null
              ? `linear-gradient(to top, rgb(20 36 28 / 0.72), transparent 55%), url(${entity.imageUrl})`
              : "linear-gradient(135deg, var(--brand-mist) 0%, var(--brand-deep) 100%)",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        {entity.imageUrl == null && (
          <div className="absolute inset-0 flex items-center justify-center opacity-35">
            <Icon className="h-14 w-14 text-white" aria-hidden />
          </div>
        )}
        <div
          className="absolute left-0 top-0 h-full w-1"
          style={{ backgroundColor: accent }}
          aria-hidden
        />
        <div className="relative z-10 flex w-full flex-wrap gap-1.5 p-3">
          <Badge variant={kindBadgeVariant(entity.kind)}>{entity.kind}</Badge>
          <Badge variant="default">{categoryLabel(entity.category)}</Badge>
          {skill && <Badge variant="default">{skill}</Badge>}
          {entity.provenance === "mock" && (
            <Badge variant="mock">Mock data</Badge>
          )}
          {entity.provenance === "apify" && (
            <Badge variant="default">Imported</Badge>
          )}
          {explainable.length > 0 && (
            <Badge variant="default">For you</Badge>
          )}
        </div>
      </div>

      <div className="space-y-2.5 p-4">
        <div className="space-y-1">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold leading-tight tracking-tight text-[var(--foreground)]">
            {entity.name}
          </h2>
          <p className="flex items-start gap-1.5 text-xs text-[var(--muted)]">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {entity.locationLabel}
          </p>
          {secondary && (
            <p className="text-xs font-medium text-[var(--foreground)]/75">
              {secondary}
            </p>
          )}
        </div>
        <p className="line-clamp-2 text-sm leading-relaxed text-[var(--foreground)]/85">
          {entity.summary}
        </p>
        {entity.provenance === "apify" && entity.imageCredit && (
          <p className="text-[11px] text-[var(--muted)]">{entity.imageCredit}</p>
        )}
        {entity.kind === "person" && (
          <p className="rounded-lg bg-[var(--mock-bg)] px-2.5 py-1.5 text-[11px] leading-snug text-[var(--mock-fg)]">
            {entity.presenceNote}
          </p>
        )}
        {explainable.length > 0 && (
          <ul className="space-y-1 rounded-lg bg-[var(--surface-elevated)] px-2.5 py-2">
            {explainable.slice(0, 2).map((reason) => (
              <li
                key={reason.code}
                className="flex items-start gap-1.5 text-[11px] text-[var(--foreground)]/85"
              >
                <Sparkles
                  className="mt-0.5 h-3 w-3 shrink-0 text-[var(--accent)]"
                  aria-hidden
                />
                {reason.label}
              </li>
            ))}
          </ul>
        )}

        <div className="flex gap-2 pt-1">
          <Button type="button" className="flex-1" onClick={onOpenDetail}>
            {primaryLabel}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </article>
  );
}
