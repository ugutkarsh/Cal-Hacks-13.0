/**
 * Natural-language activity search against the map catalog.
 * Deterministic rules parser only — no LLM; keys never sent to the browser.
 */

import { NextResponse } from "next/server";
import { runNlSearch } from "@/lib/nl-search/run-search";
import type { GeoPoint } from "@/types/map-entities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseCenter(raw: unknown): GeoPoint | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.lat !== "number" || typeof o.lng !== "number") return null;
  if (!Number.isFinite(o.lat) || !Number.isFinite(o.lng)) return null;
  return { lat: o.lat, lng: o.lng };
}

export async function POST(request: Request) {
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const o = body as Record<string, unknown>;
  const message = typeof o.message === "string" ? o.message : "";
  const result = await runNlSearch({
    message,
    criteria: o.criteria,
    confirm: o.confirm === true,
    timeZone: typeof o.timeZone === "string" ? o.timeZone : null,
    searchCenter: parseCenter(o.searchCenter),
    forceDemo: o.forceDemo === true,
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }

  return NextResponse.json(result);
}
