/**
 * Evidence-grounded summary for a catalog event or place.
 * Loads the entity from the real catalog — never accepts private feedback,
 * DMs, or client-supplied fabricated reviews.
 */

import { NextResponse } from "next/server";
import { loadMapEntities } from "@/lib/data/map-entities";
import {
  getCachedEvidenceSummary,
  setCachedEvidenceSummary,
} from "@/lib/reviews/evidence-cache";
import { buildEvidenceSummaryForEntity } from "@/lib/reviews/evidence-summary";
import type { EventEntity, PlaceEntity } from "@/types/map-entities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const entityId = url.searchParams.get("entityId")?.trim();
  if (!entityId || entityId.length > 128) {
    return NextResponse.json(
      { ok: false, error: "entityId is required" },
      { status: 400 },
    );
  }

  // Reject attempts to smuggle private feedback through query params.
  if (
    url.searchParams.has("feedback") ||
    url.searchParams.has("reviews") ||
    url.searchParams.has("activityFeedback")
  ) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Private feedback cannot be summarized. Only public catalog reviews are used.",
      },
      { status: 400 },
    );
  }

  const loaded = await loadMapEntities(
    { search: "", category: "all", kinds: ["event", "place"] },
    { forceDemo: false },
  );

  if (loaded.error) {
    return NextResponse.json(
      { ok: false, error: loaded.error },
      { status: 502 },
    );
  }

  const entity = loaded.entities.find(
    (e): e is EventEntity | PlaceEntity =>
      (e.kind === "event" || e.kind === "place") && e.id === entityId,
  );

  if (!entity) {
    return NextResponse.json(
      { ok: false, error: "Activity or venue not found in catalog" },
      { status: 404 },
    );
  }

  const fresh = buildEvidenceSummaryForEntity(entity);
  const cached = getCachedEvidenceSummary(entity.id, fresh.contentHash);
  const summary = cached ?? fresh;
  if (!cached) setCachedEvidenceSummary(fresh);

  return NextResponse.json({
    ok: true,
    summary,
    cached: Boolean(cached),
    dataMode: loaded.meta.mode,
    // Honest labeling for clients.
    llmConfigured: false,
    personalFeedbackExcluded: true,
  });
}
