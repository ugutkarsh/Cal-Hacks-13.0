/**
 * Build a meetup plan from the real map catalog.
 * Never invents venues, hours, prices, or availability.
 */

import { recommendEventsForPost } from "@/lib/community/recommend-events";
import { recommendVenuesForPost } from "@/lib/community/recommend-places";
import { loadMapEntities } from "@/lib/data/map-entities";
import {
  buildDraftShareMessage,
  buildFollowUps,
  essentialFollowUps,
  meetupPlanDisclaimer,
  meetupPlanLimitation,
  parseMeetupPlanRequest,
  sanitizeMeetupCriteria,
} from "@/lib/meetup-plan/extract-plan";
import { dayOfWeekFromIso, hourFromIso } from "@/lib/recommendations/schedule";
import {
  inferSkillFromLabel,
  skillCompatible,
} from "@/lib/recommendations/skill";
import type { PostMatchQuery } from "@/lib/community/post-to-preferences";
import type { EventEntity, GeoPoint, PlaceEntity } from "@/types/map-entities";
import type {
  MeetupPlan,
  MeetupPlanCriteria,
  MeetupPlanOption,
} from "@/types/meetup-plan";

const VENUE_AVAILABILITY =
  "Catalog venue only — opening hours, court booking, and suitability are not verified.";
const EVENT_AVAILABILITY =
  "Imported or catalog event — registration status may change; not a guarantee of open spots.";

function toMatchQuery(
  criteria: MeetupPlanCriteria,
  searchCenter: GeoPoint | null,
): PostMatchQuery {
  return {
    activity: criteria.activity,
    category: criteria.category,
    city: criteria.city,
    neighborhood: criteria.neighborhood,
    preferredDays: criteria.preferredDays,
    timeStartHour: criteria.timeStartHour,
    timeEndHour: criteria.timeEndHour,
    skillLevel: criteria.skillLevel,
    budgetCents: criteria.budgetCents,
    radiusKm: 35,
    intent: "organize_meetup",
    searchCenter,
    interestText: [criteria.activity, criteria.city, criteria.vibe]
      .filter(Boolean)
      .join(" "),
  };
}

function eventToOption(
  event: EventEntity,
  score: number,
  reasons: MeetupPlanOption["reasons"],
  criteria: MeetupPlanCriteria,
): MeetupPlanOption | null {
  // Soft capacity filter when group size stated — exclude only if capacity known and too small.
  if (
    criteria.groupSize != null &&
    event.capacity > 0 &&
    event.capacity < criteria.groupSize
  ) {
    return null;
  }
  if (criteria.budgetCents != null && event.costCents != null) {
    if (event.costCents > criteria.budgetCents) return null;
  }
  if (criteria.skillLevel && criteria.skillLevel !== "any") {
    const inferred = inferSkillFromLabel(event.difficultyLabel);
    if (skillCompatible(criteria.skillLevel, inferred) === "mismatch") {
      return null;
    }
  }

  const extra = [...reasons];
  if (criteria.groupSize != null && event.capacity > 0) {
    extra.push({
      code: "text_relevance",
      label: `Listed capacity ${event.capacity} (group size ~${criteria.groupSize})`,
    });
  }
  if (criteria.preferredDays.length > 0) {
    const day = dayOfWeekFromIso(event.startsAt);
    if (day && criteria.preferredDays.includes(day)) {
      extra.push({
        code: "schedule_fit",
        label: `Starts on ${day.toUpperCase()}`,
      });
    }
  }
  if (criteria.timeStartHour != null) {
    const hour = hourFromIso(event.startsAt);
    if (hour != null) {
      extra.push({
        code: "schedule_fit",
        label: `Catalog start hour ~${hour}:00 (UTC stand-in; verify on listing)`,
      });
    }
  }

  return {
    id: event.id,
    kind: "event",
    mapKind: "event",
    name: event.name,
    summary: event.summary,
    category: event.category,
    locationLabel: event.locationLabel,
    coordinates: event.coordinates,
    sourceUrl: event.sourceUrl,
    score,
    reasons: extra,
    availabilityNote: EVENT_AVAILABILITY,
    capacity: event.capacity > 0 ? event.capacity : null,
    attendeeCount: event.attendeeCount,
    costCents: event.costCents,
    startsAt: event.startsAt,
  };
}

function placeToOption(
  place: PlaceEntity,
  score: number,
  reasons: MeetupPlanOption["reasons"],
): MeetupPlanOption {
  return {
    id: place.id,
    kind: "venue",
    mapKind: "place",
    name: place.name,
    summary: place.summary,
    category: place.category,
    locationLabel: place.locationLabel,
    coordinates: place.coordinates,
    sourceUrl: null,
    score,
    reasons,
    availabilityNote: VENUE_AVAILABILITY,
    capacity: null,
    attendeeCount: null,
    costCents: null,
    startsAt: null,
  };
}

export type BuildMeetupPlanInput = {
  message: string;
  criteria?: unknown;
  /** When true, search even if soft follow-ups remain (group size optional). */
  confirm?: boolean;
  timeZone?: string | null;
  searchCenter?: GeoPoint | null;
  forceDemo?: boolean;
};

export async function buildMeetupPlan(
  input: BuildMeetupPlanInput,
): Promise<MeetupPlan> {
  const parsed = parseMeetupPlanRequest(input.message || "", {
    timeZone: input.timeZone,
  });

  let criteria = parsed.criteria;
  if (input.criteria != null) {
    const sanitized = sanitizeMeetupCriteria(input.criteria);
    if (sanitized) criteria = sanitized;
  }

  const followUps =
    input.criteria != null
      ? buildFollowUps(criteria)
      : parsed.followUps;
  const blocking = essentialFollowUps(followUps);

  if (blocking.length > 0 && input.confirm !== true) {
    return {
      status: "needs_info",
      engine: "deterministic-rules",
      llmConfigured: false,
      limitation: parsed.limitation,
      disclaimer: parsed.disclaimer,
      originalMessage: parsed.originalMessage || input.message,
      criteria,
      followUps: blocking,
      options: [],
      selectedOptionId: null,
      emptyReason: null,
      dataSourceLabel: "Waiting for essential details",
      draftShareMessage: null,
    };
  }

  // Soft follow-ups (group size / day) remain as tips but we still search when confirm or essentials ok.
  const softFollowUps = followUps.filter(
    (f) => f.field !== "activity" && f.field !== "city",
  );

  const loaded = await loadMapEntities(
    {
      search: "",
      category: "all",
      kinds: ["place", "event"],
    },
    { forceDemo: input.forceDemo },
  );

  if (loaded.error) {
    return {
      status: "error",
      engine: "deterministic-rules",
      llmConfigured: false,
      limitation: meetupPlanLimitation(),
      disclaimer: meetupPlanDisclaimer(),
      originalMessage: input.message,
      criteria,
      followUps: softFollowUps,
      options: [],
      selectedOptionId: null,
      emptyReason: loaded.error,
      dataSourceLabel: loaded.meta.label,
      draftShareMessage: null,
    };
  }

  const places = loaded.entities.filter(
    (e): e is PlaceEntity => e.kind === "place",
  );
  const events = loaded.entities.filter(
    (e): e is EventEntity => e.kind === "event",
  );
  const query = toMatchQuery(criteria, input.searchCenter ?? null);

  const venueRecs = recommendVenuesForPost(places, query, 8);
  const eventRecs = await recommendEventsForPost(events, query, 8);

  const options: MeetupPlanOption[] = [];

  for (const v of venueRecs.items) {
    const place = places.find((p) => p.id === v.id);
    if (!place) continue;
    options.push(placeToOption(place, v.score, v.reasons));
  }
  for (const ev of eventRecs.items) {
    const event = events.find((e) => e.id === ev.id);
    if (!event) continue;
    const opt = eventToOption(event, ev.score, ev.reasons, criteria);
    if (opt) options.push(opt);
  }

  options.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const top = options.slice(0, 12);

  if (top.length === 0) {
    const bits = [
      criteria.activity ? `“${criteria.activity}”` : null,
      criteria.city ? `near ${criteria.city}` : null,
      criteria.groupSize ? `group ~${criteria.groupSize}` : null,
    ].filter(Boolean);
    return {
      status: "empty",
      engine: "deterministic-rules",
      llmConfigured: false,
      limitation: meetupPlanLimitation(),
      disclaimer: meetupPlanDisclaimer(),
      originalMessage: parsed.originalMessage || input.message,
      criteria,
      followUps: softFollowUps,
      options: [],
      selectedOptionId: null,
      emptyReason: bits.length
        ? `No catalog venues/events matched ${bits.join(" · ")}. Nothing was invented — try broader criteria.`
        : "No catalog venues/events matched. Nothing was invented.",
      dataSourceLabel: loaded.meta.label,
      draftShareMessage: null,
    };
  }

  const selected = top[0];
  return {
    status: "suggested",
    engine: "deterministic-rules",
    llmConfigured: false,
    limitation: meetupPlanLimitation(),
    disclaimer: meetupPlanDisclaimer(),
    originalMessage: parsed.originalMessage || input.message,
    criteria,
    followUps: softFollowUps,
    options: top,
    selectedOptionId: selected.id,
    emptyReason: null,
    dataSourceLabel: loaded.meta.label,
    draftShareMessage: buildDraftShareMessage(criteria, selected.name),
  };
}
