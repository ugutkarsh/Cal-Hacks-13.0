/**
 * Report validation. Reporter identity always comes from auth — never body.
 */

import { sanitizeUntrustedText } from "@/lib/privacy/sanitize-ugc";
import type { ReportReason, ReportTargetType } from "@/types/profile";

const TARGETS: ReportTargetType[] = ["profile", "post", "reply", "message"];
const REASONS: ReportReason[] = [
  "spam",
  "harassment",
  "inappropriate",
  "impersonation",
  "safety",
  "other",
];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ReportCreateInput = {
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  details: string | null;
};

export type ReportValidationResult =
  | { ok: true; value: ReportCreateInput }
  | { ok: false; error: string };

export function parseReportCreate(body: unknown): ReportValidationResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid report payload" };
  }
  const raw = body as Record<string, unknown>;
  // Ignore forged reporterId.
  const targetType = raw.targetType;
  const targetId = raw.targetId;
  const reason = raw.reason;
  if (
    typeof targetType !== "string" ||
    !(TARGETS as string[]).includes(targetType)
  ) {
    return { ok: false, error: "Invalid report target" };
  }
  if (typeof targetId !== "string" || !UUID_RE.test(targetId)) {
    return { ok: false, error: "Invalid report target id" };
  }
  if (typeof reason !== "string" || !(REASONS as string[]).includes(reason)) {
    return { ok: false, error: "Invalid report reason" };
  }
  let details: string | null = null;
  if (raw.details !== undefined && raw.details !== null && raw.details !== "") {
    if (typeof raw.details !== "string") {
      return { ok: false, error: "Details must be text" };
    }
    // Untrusted: scrub injection phrases; never treat details as instructions.
    const t = sanitizeUntrustedText(raw.details, 1000);
    details = t || null;
  }
  return {
    ok: true,
    value: {
      targetType: targetType as ReportTargetType,
      targetId,
      reason: reason as ReportReason,
      details,
    },
  };
}

/** User-facing copy after a successful report — no removal guarantees. */
export function reportSubmittedMessage(alreadyReported: boolean): string {
  if (alreadyReported) {
    return "You already reported this. Our team can review it when available — reporting does not guarantee removal.";
  }
  return "Report submitted. Thanks for helping keep Trailmap safe. Reporting does not guarantee removal or a specific outcome.";
}

/** Reports must never be returned in public list APIs. */
export function reportsArePubliclyListable(): boolean {
  return false;
}
