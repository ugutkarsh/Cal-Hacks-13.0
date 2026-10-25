/**
 * POST /api/meetup-plan — parse request and/or build a suggested plan from the catalog.
 * Deterministic rules only. Never invents venues or claims bookings.
 */

import { NextResponse } from "next/server";
import { buildMeetupPlan } from "@/lib/meetup-plan/build-plan";
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
  if (!message.trim() && o.criteria == null) {
    return NextResponse.json(
      { ok: false, error: "Message or criteria required" },
      { status: 400 },
    );
  }

  const plan = await buildMeetupPlan({
    message,
    criteria: o.criteria,
    confirm: o.confirm === true,
    timeZone: typeof o.timeZone === "string" ? o.timeZone : null,
    searchCenter: parseCenter(o.searchCenter),
    forceDemo: o.forceDemo === true,
  });

  return NextResponse.json({ ok: true, plan });
}
