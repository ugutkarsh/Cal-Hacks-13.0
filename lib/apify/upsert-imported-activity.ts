/**
 * Idempotent Supabase write for normalized Apify activity drafts.
 */

import {
  normalizeSourceUrl,
  type NormalizedImportDraft,
} from "@/lib/apify/import-draft";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

export type UpsertOutcome =
  | { status: "imported" }
  | { status: "updated" }
  | { status: "failed"; reason: string };

async function findExistingId(
  supabase: AdminClient,
  draft: NormalizedImportDraft,
): Promise<{ id: string } | null | { error: string }> {
  const byIdentity = await supabase
    .from("activities")
    .select("id")
    .eq("source_provider", draft.sourceProvider)
    .eq("source_record_id", draft.sourceRecordId)
    .maybeSingle();

  if (byIdentity.error) {
    return { error: `Lookup failed: ${byIdentity.error.message}` };
  }
  if (byIdentity.data?.id) return { id: byIdentity.data.id };

  // Secondary: same listing URL (handles id format drift across Actors/refreshes).
  const canonUrl = normalizeSourceUrl(draft.sourceUrl);
  if (!canonUrl) return null;

  const needle = canonUrl.replace(/^https?:\/\//, "").slice(0, 120);
  const byUrl = await supabase
    .from("activities")
    .select("id, source_url")
    .eq("source_type", "apify")
    .eq("source_provider", draft.sourceProvider)
    .ilike("source_url", `%${needle}%`)
    .limit(8);

  if (byUrl.error) return null;
  const match = (byUrl.data ?? []).find((row) => {
    const existing = typeof row.source_url === "string" ? row.source_url : "";
    return normalizeSourceUrl(existing) === canonUrl;
  });
  return match?.id ? { id: match.id } : null;
}

export async function upsertImportedActivity(
  supabase: AdminClient,
  draft: NormalizedImportDraft,
  options: { runId: string | null; nowIso: string },
): Promise<UpsertOutcome> {
  const existing = await findExistingId(supabase, draft);
  if (existing && "error" in existing) {
    return { status: "failed", reason: existing.error };
  }

  const row = {
    title: draft.title,
    description: draft.description,
    category: draft.category,
    starts_at: draft.startsAt,
    ends_at: draft.endsAt,
    latitude: draft.latitude,
    longitude: draft.longitude,
    image_url: draft.imageUrl,
    source_type: draft.sourceType,
    source_url: draft.sourceUrl,
    source_provider: draft.sourceProvider,
    source_record_id: draft.sourceRecordId,
    difficulty_label: draft.difficultyLabel,
    location_label: draft.locationLabel,
    host_label: draft.hostLabel,
    cost_cents: draft.costCents,
    last_verified_at: options.nowIso,
    import_run_id: options.runId,
    place_id: null,
    organizer_id: null,
  };

  if (existing?.id) {
    const { error } = await supabase
      .from("activities")
      .update(row)
      .eq("id", existing.id);
    if (error) {
      return { status: "failed", reason: `Update failed: ${error.message}` };
    }
    return { status: "updated" };
  }

  const { error } = await supabase.from("activities").insert({
    ...row,
    imported_at: options.nowIso,
  });
  if (error) {
    if (error.code === "23505") {
      return { status: "updated" };
    }
    return { status: "failed", reason: `Insert failed: ${error.message}` };
  }
  return { status: "imported" };
}
