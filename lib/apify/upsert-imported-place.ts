/**
 * Idempotent Supabase write for normalized Apify place drafts (e.g. ClassPass).
 */

import type { NormalizedPlaceImportDraft } from "@/lib/apify/place-draft";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

export type PlaceUpsertOutcome =
  | { status: "imported" }
  | { status: "updated" }
  | { status: "failed"; reason: string };

export async function upsertImportedPlace(
  supabase: AdminClient,
  draft: NormalizedPlaceImportDraft,
  options: { nowIso: string },
): Promise<PlaceUpsertOutcome> {
  const { data: existing, error: lookupError } = await supabase
    .from("places")
    .select("id")
    .eq("source_provider", draft.sourceProvider)
    .eq("source_record_id", draft.sourceRecordId)
    .maybeSingle();

  if (lookupError) {
    return { status: "failed", reason: `Lookup failed: ${lookupError.message}` };
  }

  const row = {
    name: draft.name,
    description: draft.description,
    category: draft.category,
    latitude: draft.latitude,
    longitude: draft.longitude,
    image_url: draft.imageUrl,
    source_type: draft.sourceType,
    source_url: draft.sourceUrl,
    source_provider: draft.sourceProvider,
    source_record_id: draft.sourceRecordId,
    last_verified_at: options.nowIso,
  };

  if (existing?.id) {
    const { error } = await supabase
      .from("places")
      .update(row)
      .eq("id", existing.id);
    if (error) {
      return { status: "failed", reason: `Update failed: ${error.message}` };
    }
    return { status: "updated" };
  }

  const { error } = await supabase.from("places").insert({
    ...row,
    imported_at: options.nowIso,
  });
  if (error) {
    return { status: "failed", reason: `Insert failed: ${error.message}` };
  }
  return { status: "imported" };
}
