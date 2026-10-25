/**
 * Create a content report. No GET — reports are never publicly listable.
 * reporter_id always = auth.uid().
 * Triage hints are rules-based aids only — never auto-penalize.
 */

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  checkRateLimit,
  rateLimitExceededResponse,
} from "@/lib/privacy/rate-limit";
import {
  parseReportCreate,
  reportSubmittedMessage,
} from "@/lib/privacy/reports";
import {
  shouldAutoPenalizeFromTriage,
  triageUntrustedText,
} from "@/lib/privacy/triage";
import { publicApiError } from "@/lib/privacy/safe-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // Intentionally unavailable — reports are private moderation data only.
  return NextResponse.json(
    { ok: false, error: "Reports are not publicly listable" },
    { status: 403 },
  );
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Supabase is not configured" },
      { status: 503 },
    );
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Sign in required" },
      { status: 401 },
    );
  }

  const limited = checkRateLimit("report_create", user.id);
  if (!limited.ok) {
    const r = rateLimitExceededResponse(limited.retryAfterSec);
    return NextResponse.json(r.body, { status: r.status, headers: r.headers });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = parseReportCreate(json);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: parsed.error },
      { status: 400 },
    );
  }

  if (parsed.value.targetType === "profile" && parsed.value.targetId === user.id) {
    return NextResponse.json(
      { ok: false, error: "Cannot report yourself" },
      { status: 400 },
    );
  }

  // Soft triage from reason + optional details — never message bodies from DMs.
  // Do not send private message content to external providers (none configured).
  const triage = triageUntrustedText(
    [parsed.value.reason, parsed.value.details ?? ""].join(" "),
  );
  // Hard guarantee: never auto-penalize from triage alone.
  void shouldAutoPenalizeFromTriage(triage);

  const { error } = await supabase.from("content_reports").insert({
    reporter_id: user.id,
    target_type: parsed.value.targetType,
    target_id: parsed.value.targetId,
    reason: parsed.value.reason,
    details: parsed.value.details,
    triage_hints: triage.hints.filter((h) => h !== "insufficient_signal"),
    triage_engine: triage.engine,
  });

  if (error) {
    if (/duplicate key|unique constraint/i.test(error.message)) {
      return NextResponse.json({
        ok: true,
        alreadyReported: true,
        message: reportSubmittedMessage(true),
        // Do not expose triage to the reporter as a verdict.
        autoPenalized: false,
      });
    }
    // Column missing (migration not applied) — retry without triage fields.
    if (/triage_hints|triage_engine|column/i.test(error.message)) {
      const fallback = await supabase.from("content_reports").insert({
        reporter_id: user.id,
        target_type: parsed.value.targetType,
        target_id: parsed.value.targetId,
        reason: parsed.value.reason,
        details: parsed.value.details,
      });
      if (fallback.error) {
        if (/duplicate key|unique constraint/i.test(fallback.error.message)) {
          return NextResponse.json({
            ok: true,
            alreadyReported: true,
            message: reportSubmittedMessage(true),
            autoPenalized: false,
          });
        }
        return NextResponse.json(
          {
            ok: false,
            error: publicApiError("Could not submit report", fallback.error),
          },
          { status: 500 },
        );
      }
      return NextResponse.json(
        {
          ok: true,
          alreadyReported: false,
          message: reportSubmittedMessage(false),
          autoPenalized: false,
          triageUnavailable: true,
        },
        { status: 201 },
      );
    }
    return NextResponse.json(
      { ok: false, error: publicApiError("Could not submit report", error) },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      alreadyReported: false,
      message: reportSubmittedMessage(false),
      autoPenalized: false,
      llmModeration: false,
    },
    { status: 201 },
  );
}
