/**
 * End-to-end Apify → normalize → enrich public page description → Supabase upsert.
 * Idempotent on (source_provider, source_record_id).
 */

import { enrichDescriptionFromSourceUrl } from "@/lib/apify/enrich-event-description";
import { normalizeClasspassRecord } from "@/lib/apify/normalize-classpass";
import { normalizeEventbriteMeetupRecord } from "@/lib/apify/normalize-eventbrite-meetup";
import { normalizeEventbriteOnlyRecord } from "@/lib/apify/normalize-eventbrite-only";
import { normalizeFindEventsRecord } from "@/lib/apify/normalize-find-events";
import { normalizeMeetupRecord } from "@/lib/apify/normalize-meetup";
import {
  normalizeRunsignupRecord,
  runsignupGeocodeQuery,
} from "@/lib/apify/normalize-runsignup";
import { runClasspassActor } from "@/lib/apify/run-classpass-actor";
import { runEventbriteMeetupActor } from "@/lib/apify/run-eventbrite-meetup-actor";
import { runEventbriteOnlyActor } from "@/lib/apify/run-eventbrite-only-actor";
import { runFindEventsActor } from "@/lib/apify/run-find-events-actor";
import { runMeetupEventsActor } from "@/lib/apify/run-meetup-actor";
import { runRunsignupActor } from "@/lib/apify/run-runsignup-actor";
import { upsertImportedActivity } from "@/lib/apify/upsert-imported-activity";
import { upsertImportedPlace } from "@/lib/apify/upsert-imported-place";
import type { NormalizedImportDraft } from "@/lib/apify/import-draft";
import { geocodeQueryServer } from "@/lib/location/nominatim-server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  APIFY_CLASSPASS_ACTOR_ID,
  type ApifyClasspassActorInput,
  type ApifyClasspassRecord,
} from "@/types/apify-classpass";
import {
  APIFY_EVENTBRITE_MEETUP_ACTOR_ID,
  type ApifyEventbriteMeetupActorInput,
  type ApifyEventbriteMeetupRecord,
} from "@/types/apify-eventbrite-meetup";
import {
  APIFY_EVENTBRITE_ONLY_ACTOR_ID,
  type ApifyEventbriteOnlyActorInput,
  type ApifyEventbriteOnlyRecord,
} from "@/types/apify-eventbrite-only";
import {
  APIFY_FIND_EVENTS_ACTOR_ID,
  type ApifyFindEventsActorInput,
  type ApifyFindEventsRecord,
} from "@/types/apify-find-events";
import {
  APIFY_MEETUP_ACTOR_ID,
  type ApifyMeetupActorInput,
  type ApifyMeetupEventRecord,
} from "@/types/apify-meetup";
import {
  APIFY_RUNSIGNUP_ACTOR_ID,
  type ApifyRunsignupActorInput,
  type ApifyRunsignupRecord,
} from "@/types/apify-runsignup";

export type IngestSummary = {
  actorId: string;
  runId: string | null;
  fetched: number;
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  /** Drafts where the public event page yielded a longer description. */
  descriptionsEnriched: number;
  skipReasons: Record<string, number>;
  failures: Array<{ sourceRecordId: string | null; reason: string }>;
  methodNote: string;
};

function emptySummary(actorId: string, methodNote: string): IngestSummary {
  return {
    actorId,
    runId: null,
    fetched: 0,
    imported: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    descriptionsEnriched: 0,
    skipReasons: {},
    failures: [],
    methodNote,
  };
}

async function enrichDraft(
  draft: NormalizedImportDraft,
  enrich: boolean,
): Promise<{ draft: NormalizedImportDraft; enriched: boolean }> {
  if (!enrich) return { draft, enriched: false };
  const before = draft.description.trim();
  const after = await enrichDescriptionFromSourceUrl(
    draft.sourceUrl,
    draft.description,
  );
  if (after !== before && after.length > before.length) {
    return {
      draft: { ...draft, description: after },
      enriched: true,
    };
  }
  return { draft, enriched: false };
}

export async function ingestMeetupEventsViaApify(
  input: ApifyMeetupActorInput,
  options?: {
    items?: ApifyMeetupEventRecord[];
    runId?: string;
    supabase?: ReturnType<typeof createSupabaseAdminClient>;
    /** Fetch full public page descriptions (default true for live runs). */
    enrichDescriptions?: boolean;
  },
): Promise<IngestSummary> {
  const summary = emptySummary(
    APIFY_MEETUP_ACTOR_ID,
    "Apify Meetup → enrich public page description → Supabase upsert. Not mock data.",
  );

  let items = options?.items;
  let runId = options?.runId ?? null;
  const enrich = options?.enrichDescriptions ?? options?.items == null;

  if (!items) {
    const run = await runMeetupEventsActor(input);
    items = run.items;
    runId = run.runId;
  }

  summary.runId = runId;
  summary.fetched = items.length;

  const supabase = options?.supabase ?? createSupabaseAdminClient();
  const now = new Date().toISOString();

  for (const record of items) {
    const normalized = normalizeMeetupRecord(record);
    if (!normalized.ok) {
      summary.skipped += 1;
      summary.skipReasons[normalized.reason] =
        (summary.skipReasons[normalized.reason] ?? 0) + 1;
      continue;
    }

    const { draft, enriched } = await enrichDraft(normalized.draft, enrich);
    if (enriched) summary.descriptionsEnriched += 1;

    const outcome = await upsertImportedActivity(supabase, draft, {
      runId,
      nowIso: now,
    });
    if (outcome.status === "imported") summary.imported += 1;
    else if (outcome.status === "updated") summary.updated += 1;
    else {
      summary.failed += 1;
      summary.failures.push({
        sourceRecordId: draft.sourceRecordId,
        reason: outcome.reason,
      });
    }
  }

  return summary;
}

/**
 * Recreation sports ingest via Eventbrite + Meetup dual Actor.
 * Default keywords cover badminton, volleyball, open gym, etc.
 */
export async function ingestEventbriteMeetupViaApify(
  input: ApifyEventbriteMeetupActorInput,
  options?: {
    items?: ApifyEventbriteMeetupRecord[];
    runId?: string;
    supabase?: ReturnType<typeof createSupabaseAdminClient>;
    enrichDescriptions?: boolean;
  },
): Promise<IngestSummary> {
  const summary = emptySummary(
    APIFY_EVENTBRITE_MEETUP_ACTOR_ID,
    "Apify Eventbrite+Meetup → enrich public page description → Supabase upsert. Not mock data.",
  );

  let items = options?.items;
  let runId = options?.runId ?? null;
  const enrich = options?.enrichDescriptions ?? options?.items == null;

  if (!items) {
    const run = await runEventbriteMeetupActor(input);
    items = run.items;
    runId = run.runId;
  }

  summary.runId = runId;
  summary.fetched = items.length;

  const supabase = options?.supabase ?? createSupabaseAdminClient();
  const now = new Date().toISOString();

  for (const record of items) {
    const normalized = normalizeEventbriteMeetupRecord(record);
    if (!normalized.ok) {
      summary.skipped += 1;
      summary.skipReasons[normalized.reason] =
        (summary.skipReasons[normalized.reason] ?? 0) + 1;
      continue;
    }

    const { draft, enriched } = await enrichDraft(normalized.draft, enrich);
    if (enriched) summary.descriptionsEnriched += 1;

    const outcome = await upsertImportedActivity(supabase, draft, {
      runId,
      nowIso: now,
    });
    if (outcome.status === "imported") summary.imported += 1;
    else if (outcome.status === "updated") summary.updated += 1;
    else {
      summary.failed += 1;
      summary.failures.push({
        sourceRecordId: draft.sourceRecordId,
        reason: outcome.reason,
      });
    }
  }

  return summary;
}

/**
 * Multi-platform recreation ingest via hypebridge/find-events.
 * Default category sports_fitness; platforms Meetup / Eventbrite / RunSignup / Luma.
 */
export async function ingestFindEventsViaApify(
  input: ApifyFindEventsActorInput,
  options?: {
    items?: ApifyFindEventsRecord[];
    runId?: string;
    supabase?: ReturnType<typeof createSupabaseAdminClient>;
    enrichDescriptions?: boolean;
  },
): Promise<IngestSummary> {
  const summary = emptySummary(
    APIFY_FIND_EVENTS_ACTOR_ID,
    "Apify Find Events (multi-platform) → enrich → Supabase upsert. Not mock data.",
  );

  let items = options?.items;
  let runId = options?.runId ?? null;
  const enrich = options?.enrichDescriptions ?? options?.items == null;

  if (!items) {
    const run = await runFindEventsActor(input);
    items = run.items;
    runId = run.runId;
  }

  summary.runId = runId;
  summary.fetched = items.length;

  const supabase = options?.supabase ?? createSupabaseAdminClient();
  const now = new Date().toISOString();

  for (const record of items) {
    const normalized = normalizeFindEventsRecord(record);
    if (!normalized.ok) {
      summary.skipped += 1;
      summary.skipReasons[normalized.reason] =
        (summary.skipReasons[normalized.reason] ?? 0) + 1;
      continue;
    }

    const { draft, enriched } = await enrichDraft(normalized.draft, enrich);
    if (enriched) summary.descriptionsEnriched += 1;

    const outcome = await upsertImportedActivity(supabase, draft, {
      runId,
      nowIso: now,
    });
    if (outcome.status === "imported") summary.imported += 1;
    else if (outcome.status === "updated") summary.updated += 1;
    else {
      summary.failed += 1;
      summary.failures.push({
        sourceRecordId: draft.sourceRecordId,
        reason: outcome.reason,
      });
    }
  }

  return summary;
}

/**
 * Eventbrite-only sports/fitness browse via crawlerbros/eventbrite-scraper.
 */
export async function ingestEventbriteOnlyViaApify(
  input: ApifyEventbriteOnlyActorInput,
  options?: {
    items?: ApifyEventbriteOnlyRecord[];
    runId?: string;
    supabase?: ReturnType<typeof createSupabaseAdminClient>;
    enrichDescriptions?: boolean;
  },
): Promise<IngestSummary> {
  const summary = emptySummary(
    APIFY_EVENTBRITE_ONLY_ACTOR_ID,
    "Apify Eventbrite-only → enrich → Supabase activities upsert. Not mock data.",
  );

  let items = options?.items;
  let runId = options?.runId ?? null;
  const enrich = options?.enrichDescriptions ?? options?.items == null;

  if (!items) {
    const run = await runEventbriteOnlyActor(input);
    items = run.items;
    runId = run.runId;
  }

  summary.runId = runId;
  summary.fetched = items.length;

  const supabase = options?.supabase ?? createSupabaseAdminClient();
  const now = new Date().toISOString();

  for (const record of items) {
    const normalized = normalizeEventbriteOnlyRecord(record);
    if (!normalized.ok) {
      summary.skipped += 1;
      summary.skipReasons[normalized.reason] =
        (summary.skipReasons[normalized.reason] ?? 0) + 1;
      continue;
    }

    const { draft, enriched } = await enrichDraft(normalized.draft, enrich);
    if (enriched) summary.descriptionsEnriched += 1;

    const outcome = await upsertImportedActivity(supabase, draft, {
      runId,
      nowIso: now,
    });
    if (outcome.status === "imported") summary.imported += 1;
    else if (outcome.status === "updated") summary.updated += 1;
    else {
      summary.failed += 1;
      summary.failures.push({
        sourceRecordId: draft.sourceRecordId,
        reason: outcome.reason,
      });
    }
  }

  return summary;
}

/**
 * RunSignup races → activities. City geocode when Actor omits lat/lng.
 */
export async function ingestRunsignupViaApify(
  input: ApifyRunsignupActorInput,
  options?: {
    items?: ApifyRunsignupRecord[];
    runId?: string;
    supabase?: ReturnType<typeof createSupabaseAdminClient>;
    enrichDescriptions?: boolean;
    /** Injectable geocoder for tests. */
    geocode?: (query: string) => Promise<{ lat: number; lng: number } | null>;
  },
): Promise<IngestSummary> {
  const summary = emptySummary(
    APIFY_RUNSIGNUP_ACTOR_ID,
    "Apify RunSignup races → city geocode when needed → Supabase activities. Not mock data.",
  );

  let items = options?.items;
  let runId = options?.runId ?? null;
  const enrich = options?.enrichDescriptions ?? options?.items == null;
  const geocode = options?.geocode ?? geocodeQueryServer;

  if (!items) {
    const run = await runRunsignupActor(input);
    items = run.items;
    runId = run.runId;
  }

  summary.runId = runId;
  summary.fetched = items.length;

  const supabase = options?.supabase ?? createSupabaseAdminClient();
  const now = new Date().toISOString();

  for (const record of items) {
    let coords: { lat: number; lng: number } | null = null;
    if (
      typeof record.latitude === "number" &&
      typeof record.longitude === "number"
    ) {
      coords = { lat: record.latitude, lng: record.longitude };
    } else {
      const query = runsignupGeocodeQuery(record);
      if (query) {
        const hit = await geocode(query);
        if (hit) coords = { lat: hit.lat, lng: hit.lng };
      }
    }

    const normalized = normalizeRunsignupRecord(record, { coords });
    if (!normalized.ok) {
      summary.skipped += 1;
      summary.skipReasons[normalized.reason] =
        (summary.skipReasons[normalized.reason] ?? 0) + 1;
      continue;
    }

    const { draft, enriched } = await enrichDraft(normalized.draft, enrich);
    if (enriched) summary.descriptionsEnriched += 1;

    const outcome = await upsertImportedActivity(supabase, draft, {
      runId,
      nowIso: now,
    });
    if (outcome.status === "imported") summary.imported += 1;
    else if (outcome.status === "updated") summary.updated += 1;
    else {
      summary.failed += 1;
      summary.failures.push({
        sourceRecordId: draft.sourceRecordId,
        reason: outcome.reason,
      });
    }
  }

  return summary;
}

/**
 * ClassPass studios → places (venues), not timed activities.
 */
export async function ingestClasspassViaApify(
  input: ApifyClasspassActorInput,
  options?: {
    items?: ApifyClasspassRecord[];
    runId?: string;
    supabase?: ReturnType<typeof createSupabaseAdminClient>;
  },
): Promise<IngestSummary> {
  const summary = emptySummary(
    APIFY_CLASSPASS_ACTOR_ID,
    "Apify ClassPass studios → Supabase places upsert. Not mock data.",
  );

  let items = options?.items;
  let runId = options?.runId ?? null;

  if (!items) {
    const run = await runClasspassActor(input);
    items = run.items;
    runId = run.runId;
  }

  summary.runId = runId;
  summary.fetched = items.length;

  const supabase = options?.supabase ?? createSupabaseAdminClient();
  const now = new Date().toISOString();

  for (const record of items) {
    const normalized = normalizeClasspassRecord(record);
    if (!normalized.ok) {
      summary.skipped += 1;
      summary.skipReasons[normalized.reason] =
        (summary.skipReasons[normalized.reason] ?? 0) + 1;
      continue;
    }

    const outcome = await upsertImportedPlace(supabase, normalized.draft, {
      nowIso: now,
    });
    if (outcome.status === "imported") summary.imported += 1;
    else if (outcome.status === "updated") summary.updated += 1;
    else {
      summary.failed += 1;
      summary.failures.push({
        sourceRecordId: normalized.draft.sourceRecordId,
        reason: outcome.reason,
      });
    }
  }

  return summary;
}
