/**
 * Extract structured preferences from a community post message.
 * Deterministic rules only — no LLM provider is configured in this project.
 * User text is never interpolated into SQL, system prompts, or auth checks.
 */

import { NextResponse } from "next/server";
import { unavailablePostExtraction } from "@/lib/community/extract-preferences";
import {
  parseExtractRequest,
  runPostExtraction,
} from "@/lib/community/extract-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parsed = parseExtractRequest(body);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: parsed.error },
      { status: 400 },
    );
  }

  try {
    const result = runPostExtraction(
      parsed.value.message,
      parsed.value.timeZone,
    );

    return NextResponse.json({
      ok: true,
      ...result,
      // Honest capability flag for clients — never claim an LLM was used.
      llmConfigured: false,
    });
  } catch {
    const unavailable = unavailablePostExtraction(parsed.value.message);
    return NextResponse.json({
      ok: true,
      ...unavailable,
      llmConfigured: false,
    });
  }
}
