import { NextResponse } from "next/server";
import { enrichDescriptionFromSourceUrl } from "@/lib/apify/enrich-event-description";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * On-demand full description from the public Meetup/Eventbrite page.
 * Used when the stored Apify summary is truncated mid-sentence.
 */
export async function POST(request: Request) {
  let body: { sourceUrl?: unknown; summary?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const sourceUrl =
    typeof body.sourceUrl === "string" ? body.sourceUrl.trim() : "";
  const summary = typeof body.summary === "string" ? body.summary : "";

  if (!sourceUrl.startsWith("https://")) {
    return NextResponse.json(
      { ok: false, error: "Valid https sourceUrl required" },
      { status: 400 },
    );
  }

  try {
    const description = await enrichDescriptionFromSourceUrl(
      sourceUrl,
      summary,
    );
    return NextResponse.json({
      ok: true,
      description,
      improved: description.trim().length > summary.trim().length,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Enrich failed",
      },
      { status: 500 },
    );
  }
}
