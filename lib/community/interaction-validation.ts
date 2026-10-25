/**
 * Server-side validation for replies and interest payloads.
 * Forged user/author/post owner ids are ignored by callers.
 */

import type { ReplyCreateInput } from "@/types/community-interaction";

export const REPLY_BODY_MAX = 1000;

export type InteractionValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/**
 * Parse reply create body. Only `body` is accepted.
 * Ignores forged authorId / userId / postId.
 */
export function parseReplyCreate(
  body: unknown,
): InteractionValidationResult<ReplyCreateInput> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid reply payload" };
  }
  const raw = body as Record<string, unknown>;
  if (typeof raw.body !== "string") {
    return { ok: false, error: "Reply body is required" };
  }
  const text = raw.body.trim();
  if (!text || text.length > REPLY_BODY_MAX) {
    return {
      ok: false,
      error: `Reply must be 1–${REPLY_BODY_MAX} characters`,
    };
  }
  return { ok: true, value: { body: text } };
}

/** True when a Postgres unique-violation indicates duplicate interest. */
export function isDuplicateInterestError(message: string | null | undefined): boolean {
  if (!message) return false;
  return (
    /duplicate key|unique constraint|community_post_interests_unique/i.test(
      message,
    )
  );
}
