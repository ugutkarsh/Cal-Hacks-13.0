"use client";

import Image from "next/image";
import {
  useEffect,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  applyDemoJoin,
  confirmExternalJoin,
  demoJoinCaption,
  initialDemoRegistration,
  joinButtonLabel,
  shouldOpenExternalRegistration,
  type DemoRegistrationState,
} from "@/lib/demo-registration";
import {
  confirmExternalRegistration,
  isExternallyRegistered,
} from "@/lib/external-registration";
import { EvidenceSummaryPanel } from "@/components/postcards/evidence-summary-panel";
import { categoryLabel, formatEventWhen } from "@/lib/utils";
import type { FeedbackAction } from "@/types/feedback";
import type {
  EventEntity,
  MapEntity,
  PlaceEntity,
  PersonEntity,
} from "@/types/map-entities";
import type { CompatibilityMatch } from "@/types/compatibility";
import type { RecommendationReason } from "@/types/recommendations";
import {
  Bookmark,
  Calendar,
  ChevronDown,
  Footprints,
  Heart,
  MapPin,
  MessageCircle,
  SkipForward,
  Star,
  UserPlus,
  Users,
  X,
} from "lucide-react";

interface DetailPostcardProps {
  entity: MapEntity;
  recommendationReasons?: RecommendationReason[];
  /** Viewer↔peer compatibility when ranked for the signed-in user. */
  personCompatibility?: CompatibilityMatch | null;
  /** Scopes private “I’ve registered” confirmations when signed in. */
  storageOwnerId?: string | null;
  onClose: () => void;
  onFeedback?: (action: FeedbackAction, rating?: number) => void;
  onMessagePerson?: (peerId: string) => void;
}

function MetaRow({
  icon: Icon,
  children,
}: {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  children: ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 text-[15px] text-[var(--accent-foreground)]/90">
      <Icon
        className="h-[18px] w-[18px] shrink-0 text-[var(--brand-mist)]"
        aria-hidden
      />
      <span>{children}</span>
    </li>
  );
}

function HeroMedia({ entity }: { entity: MapEntity }) {
  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl bg-[var(--brand-deep)]">
      {entity.imageUrl ? (
        <Image
          src={entity.imageUrl}
          alt=""
          fill
          className="object-cover"
          sizes="(max-width: 512px) 100vw, 480px"
          priority
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(145deg, var(--brand-mid) 0%, var(--brand-deep) 60%, #0a1a14 100%)",
          }}
          aria-hidden
        />
      )}
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[var(--brand-deep)]/50 to-transparent"
        aria-hidden
      />
      {(entity.imageCredit || entity.provenance === "mock") && (
        <span className="absolute bottom-3 left-3 rounded-full bg-[var(--brand-deep)]/70 px-2.5 py-1 text-[11px] text-white/90 backdrop-blur-sm">
          {entity.imageCredit ?? "demo image"}
        </span>
      )}
    </div>
  );
}

/** Strip HTML + light markdown so imported Meetup/Eventbrite text reads cleanly. */
function formatEventDescription(raw: string): string {
  return raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Meetup often ships **bold** / *** markers; show plain text
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
    .replace(/\*{2,}/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function looksTruncated(text: string): boolean {
  const t = text.trim();
  if (t.length < 40) return false;
  return /(\.\.\.|…|\*\*\*AI|\*\*\*$|[—–-]$)/i.test(t.slice(-32));
}

function AboutDescription({
  text,
  sourceUrl,
}: {
  text: string;
  sourceUrl: string | null;
}) {
  const initial = formatEventDescription(text);
  const [body, setBody] = useState(initial);
  const [expanded, setExpanded] = useState(true);
  const [loadState, setLoadState] = useState<
    "idle" | "loading" | "done" | "failed"
  >("idle");

  // When Apify stored a cut-off summary, pull the public page text on open.
  useEffect(() => {
    setBody(formatEventDescription(text));
    setLoadState("idle");
  }, [text, sourceUrl]);

  useEffect(() => {
    if (!sourceUrl || !looksTruncated(initial)) return;
    if (loadState !== "idle") return;

    let cancelled = false;
    setLoadState("loading");

    void (async () => {
      try {
        const res = await fetch("/api/enrich-description", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceUrl, summary: text }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          description?: string;
          improved?: boolean;
        };
        if (cancelled) return;
        if (data.ok && data.description && data.improved) {
          setBody(formatEventDescription(data.description));
          setExpanded(true);
          setLoadState("done");
        } else {
          setLoadState("failed");
        }
      } catch {
        if (!cancelled) setLoadState("failed");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sourceUrl, text, initial, loadState]);

  const needsToggle = body.length > 320;

  return (
    <section>
      <h3 className="text-base font-semibold text-white">About this event</h3>
      <p
        className={
          expanded
            ? "mt-2 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-neutral-300"
            : "mt-2 line-clamp-6 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-neutral-300"
        }
      >
        {body || "No description provided."}
      </p>
      {loadState === "loading" && (
        <p className="mt-2 text-[12px] text-neutral-500" role="status">
          Loading full description from the listing…
        </p>
      )}
      {needsToggle && (
        <button
          type="button"
          className="mt-2 text-sm font-medium text-white/80 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      )}
      {sourceUrl && (
        <p className="mt-2 text-[12px] text-neutral-500">
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-neutral-300 underline-offset-2 hover:underline"
          >
            Open original listing
          </a>
          {loadState === "failed"
            ? " · Couldn’t expand this preview — open the listing for the full text."
            : null}
        </p>
      )}
    </section>
  );
}

function EventBody({
  entity,
  registration,
  recommendationReasons = [],
  onJoin,
  onConfirmExternal,
  onFeedback,
}: {
  entity: EventEntity;
  registration: DemoRegistrationState;
  recommendationReasons?: RecommendationReason[];
  onJoin: () => void;
  onConfirmExternal?: () => void;
  onFeedback?: (action: FeedbackAction, rating?: number) => void;
}) {
  const explainable = recommendationReasons.filter((r) =>
    [
      "text_relevance",
      "interest_match",
      "within_budget",
      "within_distance",
      "schedule_fit",
      "skill_fit",
      "prior_positive_feedback",
      "similar_feedback_affinity",
      "search_intent_match",
    ].includes(r.code),
  );
  const hostLabel =
    entity.provenance === "apify" ? "Host group:" : "Organizer:";

  return (
    <>
      <p className="mt-2 text-xs font-medium uppercase tracking-[0.14em] text-neutral-400">
        {entity.provenance === "mock"
          ? "Demo event · Not a real listing"
          : entity.provenance === "apify"
            ? "From Luma / Meetup / Eventbrite · register on their site"
            : `${categoryLabel(entity.category)} event`}
      </p>
      {entity.provenance === "apify" && entity.imageCredit && (
        <p className="mt-1 text-[11px] text-neutral-500">{entity.imageCredit}</p>
      )}

      <ul className="mt-5 space-y-3.5" aria-label="Event details">
        <MetaRow icon={Calendar}>{formatEventWhen(entity.startsAt)}</MetaRow>
        <MetaRow icon={MapPin}>{entity.locationLabel}</MetaRow>
        <MetaRow icon={Users}>
          {entity.attendeeCount} of {entity.capacity}
          {entity.provenance === "mock"
            ? " demo registrations"
            : " attending (from listing)"}
        </MetaRow>
        <MetaRow icon={Footprints}>{entity.difficultyLabel}</MetaRow>
        <MetaRow icon={Star}>
          {entity.costCents == null
            ? "Cost unknown"
            : entity.costCents === 0
              ? "Free"
              : `$${(entity.costCents / 100).toFixed(0)}`}
        </MetaRow>
      </ul>

      {explainable.length > 0 && (
        <section className="mt-5 rounded-lg bg-white/5 p-3">
          <h3 className="text-sm font-semibold text-white">Why recommended</h3>
          <ul className="mt-2 space-y-1 text-xs text-neutral-300">
            {explainable.map((r) => (
              <li key={r.code}>• {r.label}</li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] text-neutral-500">
            Rule-based scoring from your preferences — not a trained ML model.
          </p>
        </section>
      )}

      <hr className="my-6 border-0 border-t border-neutral-800" />

      <AboutDescription text={entity.summary} sourceUrl={entity.sourceUrl} />

      <dl className="mt-5 space-y-2 text-[15px]">
        <div className="flex gap-2">
          <dt className="shrink-0 font-semibold text-white">{hostLabel}</dt>
          <dd className="text-neutral-300">{entity.organizerName}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="shrink-0 font-semibold text-white">Attendees:</dt>
          <dd className="text-neutral-300">
            {entity.provenance === "mock"
              ? "Sample profiles only"
              : entity.attendeesPreview.join(", ") || "None listed"}
          </dd>
        </div>
      </dl>

      <EvidenceSummaryPanel entity={entity} />

      {onFeedback && (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-white"
            onClick={() => onFeedback("save")}
          >
            <Bookmark className="h-3.5 w-3.5" aria-hidden />
            Save
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-white"
            onClick={() => onFeedback("like")}
          >
            <Heart className="h-3.5 w-3.5" aria-hidden />
            Like
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-white"
            onClick={() => onFeedback("skip")}
          >
            <SkipForward className="h-3.5 w-3.5" aria-hidden />
            Dismiss
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-white"
            onClick={() => onFeedback("rate", 5)}
          >
            <Star className="h-3.5 w-3.5" aria-hidden />
            Rate 5
          </button>
        </div>
      )}
      <p className="mt-2 text-center text-[10px] text-neutral-500">
        Feedback personalizes rankings with rules (not a trained model). Signed-in
        feedback syncs privately; guests stay on this device. Clear anytime in
        Preferences.
      </p>

      <div className="mt-6 flex flex-col items-center pb-1 pt-2">
        <button
          type="button"
          onClick={() => {
            onJoin();
            // Only record private "join" feedback for demo / non-external flows.
            if (!shouldOpenExternalRegistration(entity)) {
              onFeedback?.("join");
            }
          }}
          disabled={
            registration.registered
              ? true
              : shouldOpenExternalRegistration(entity)
                ? !entity.sourceUrl
                : !entity.isRegistrationOpen
          }
          className="group flex flex-col items-center gap-1 rounded-xl px-4 py-2 text-center transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-60"
          aria-describedby="join-caption"
        >
          <UserPlus
            className="h-6 w-6 text-white group-hover:scale-105"
            aria-hidden
          />
          <span className="text-base font-semibold text-white">
            {joinButtonLabel(registration, entity)}
          </span>
        </button>
        {shouldOpenExternalRegistration(entity) &&
          !registration.registered &&
          onConfirmExternal && (
            <button
              type="button"
              onClick={onConfirmExternal}
              className="mt-3 rounded-xl border border-white/25 bg-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              I’ve registered on the listing
            </button>
          )}
        <p
          id="join-caption"
          className="mt-2 max-w-[18rem] text-center text-xs text-neutral-500"
          role="status"
        >
          {demoJoinCaption(registration, entity)}
        </p>
        <ChevronDown
          className="mt-3 h-4 w-4 text-neutral-600"
          aria-hidden
        />
      </div>
    </>
  );
}

function PlaceBody({ entity }: { entity: PlaceEntity }) {
  return (
    <>
      <p className="mt-2 text-xs font-medium uppercase tracking-[0.14em] text-neutral-400">
        {entity.provenance === "mock"
          ? "Demo place · Not a live venue listing"
          : "Place"}
      </p>
      <ul className="mt-5 space-y-3.5">
        <MetaRow icon={MapPin}>{entity.locationLabel}</MetaRow>
        {entity.rating != null && (
          <MetaRow icon={Star}>
            {entity.rating.toFixed(1)} · {entity.reviewCount} reviews
          </MetaRow>
        )}
        <MetaRow icon={Footprints}>
          {entity.amenities.join(" · ") || categoryLabel(entity.category)}
        </MetaRow>
      </ul>
      <hr className="my-6 border-0 border-t border-neutral-800" />
      <section>
        <h3 className="text-base font-semibold text-white">About this place</h3>
        <p className="mt-2 text-[15px] leading-relaxed text-neutral-300">
          {entity.summary}
        </p>
      </section>
      <EvidenceSummaryPanel entity={entity} />
      <p className="mt-8 pb-2 text-center text-xs text-neutral-500">
        Save place coming with auth
      </p>
    </>
  );
}

function PersonBody({
  entity,
  compatibility,
  onMessagePerson,
}: {
  entity: PersonEntity;
  compatibility?: CompatibilityMatch | null;
  onMessagePerson?: (peerId: string) => void;
}) {
  return (
    <>
      <p className="mt-2 text-xs font-medium uppercase tracking-[0.14em] text-neutral-400">
        {entity.provenance === "mock"
          ? "Demo profile · Not a live location"
          : "Discoverable profile · Approximate pin only"}
      </p>
      <ul className="mt-5 space-y-3.5">
        <MetaRow icon={MapPin}>{entity.locationLabel}</MetaRow>
        <MetaRow icon={Footprints}>
          {entity.interests.map(categoryLabel).join(" · ") || "Interests not listed"}
        </MetaRow>
      </ul>

      {compatibility && (
        <section className="mt-5 rounded-xl bg-white/5 p-3">
          <h3 className="text-sm font-semibold text-white">
            Compatibility · {compatibility.scorePercent}%
          </h3>
          <p className="mt-1 text-[10px] text-neutral-500">
            Based on shared profile fields only — missing data is skipped, not
            guessed.
          </p>
          <ul className="mt-2 space-y-1 text-xs text-neutral-300">
            {compatibility.reasons.map((r) => (
              <li key={`${r.code}-${r.label}`}>• {r.label}</li>
            ))}
          </ul>
        </section>
      )}

      <hr className="my-6 border-0 border-t border-neutral-800" />
      <section>
        <h3 className="text-base font-semibold text-white">About</h3>
        <p className="mt-2 text-[15px] leading-relaxed text-neutral-300">
          {entity.bio}
        </p>
        <p className="mt-4 rounded-lg bg-white/5 px-3 py-2 text-xs leading-relaxed text-neutral-400">
          {entity.presenceNote}
        </p>
        <p className="mt-3 text-xs leading-relaxed text-neutral-500">
          Their searches and preferences stay private — you only see what they
          chose to share on their profile.
        </p>
        {entity.provenance !== "mock" &&
          onMessagePerson &&
          (compatibility?.acceptsMessages !== false) && (
            <button
              type="button"
              onClick={() => onMessagePerson(entity.id)}
              className="mt-4 inline-flex items-center gap-2 rounded-xl border border-white/20 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <MessageCircle className="h-4 w-4" aria-hidden />
              Message
            </button>
          )}
        {entity.provenance === "mock" && (
          <p className="mt-4 text-xs text-neutral-500">
            Mock pins are for layout only — messaging needs a real signed-in
            discoverable profile.
          </p>
        )}
      </section>
    </>
  );
}

export function DetailPostcard({
  entity,
  recommendationReasons,
  personCompatibility = null,
  storageOwnerId = null,
  onClose,
  onFeedback,
  onMessagePerson,
}: DetailPostcardProps) {
  const [registration, setRegistration] = useState(() =>
    initialDemoRegistration(
      entity.kind === "event" &&
        isExternallyRegistered(entity.id, storageOwnerId),
    ),
  );

  function handleJoin() {
    if (entity.kind !== "event") return;
    // Imported Luma/Meetup/Eventbrite/etc. → open listing; confirm after RSVP.
    if (shouldOpenExternalRegistration(entity) && entity.sourceUrl) {
      window.open(entity.sourceUrl, "_blank", "noopener,noreferrer");
      setRegistration((current) => applyDemoJoin(current, entity));
      return;
    }
    setRegistration((current) => applyDemoJoin(current, entity));
  }

  function handleConfirmExternal() {
    if (entity.kind !== "event") return;
    confirmExternalRegistration(entity.id, storageOwnerId);
    setRegistration(confirmExternalJoin);
    onFeedback?.("join");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-stretch sm:justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="detail-title"
    >
      <button
        type="button"
        className="discovery-backdrop absolute inset-0"
        aria-label="Close detail view"
        onClick={onClose}
      />

      <article className="discovery-detail-enter relative z-10 flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-[var(--brand-deep)] text-white shadow-[var(--shadow-panel)] sm:h-full sm:max-h-none sm:rounded-none sm:rounded-l-3xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-colors hover:bg-black/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="overflow-y-auto px-4 pb-6 pt-4">
          <HeroMedia entity={entity} />

          <h2
            id="detail-title"
            className="mt-5 font-[family-name:var(--font-display)] text-[1.75rem] font-bold leading-tight tracking-tight text-white"
          >
            {entity.name}
          </h2>

          {entity.kind === "event" && (
            <EventBody
              entity={entity}
              registration={registration}
              recommendationReasons={recommendationReasons}
              onJoin={handleJoin}
              onConfirmExternal={
                shouldOpenExternalRegistration(entity)
                  ? handleConfirmExternal
                  : undefined
              }
              onFeedback={onFeedback}
            />
          )}
          {entity.kind === "place" && <PlaceBody entity={entity} />}
          {entity.kind === "person" && (
            <PersonBody
              entity={entity}
              compatibility={personCompatibility}
              onMessagePerson={onMessagePerson}
            />
          )}
        </div>
      </article>
    </div>
  );
}
