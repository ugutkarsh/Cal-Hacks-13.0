/**
 * Server-side DM validation. Never trusts a client-supplied senderId.
 */

import { MESSAGE_BODY_MAX } from "@/types/messaging";

export const MESSAGE_LIST_DEFAULT_LIMIT = 50;
export const MESSAGE_LIST_MAX_LIMIT = 100;
export const CONVERSATION_LIST_DEFAULT_LIMIT = 30;
export const CONVERSATION_LIST_MAX_LIMIT = 50;

export type MessagingValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function parseMessageBody(
  raw: unknown,
): MessagingValidationResult<string> {
  if (typeof raw !== "string") {
    return { ok: false, error: "Message body must be a string" };
  }
  const body = raw.trim();
  if (!body) {
    return { ok: false, error: "Message cannot be empty" };
  }
  if (body.length > MESSAGE_BODY_MAX) {
    return {
      ok: false,
      error: `Message must be at most ${MESSAGE_BODY_MAX} characters`,
    };
  }
  return { ok: true, value: body };
}

export function parseStartConversationBody(
  raw: unknown,
): MessagingValidationResult<{ peerId: string }> {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "Invalid JSON body" };
  }
  const peerId = (raw as { peerId?: unknown }).peerId;
  // Ignore any forged senderId / conversationId from the client.
  if (!isUuid(peerId)) {
    return { ok: false, error: "peerId must be a valid UUID" };
  }
  return { ok: true, value: { peerId } };
}

export function parseSendMessageBody(
  raw: unknown,
): MessagingValidationResult<{ body: string }> {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "Invalid JSON body" };
  }
  const parsed = parseMessageBody((raw as { body?: unknown }).body);
  if (!parsed.ok) return parsed;
  return { ok: true, value: { body: parsed.value } };
}

export function parseLimit(
  raw: string | null,
  fallback: number,
  max: number,
): number {
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.floor(n), max);
}

export function parseMessageCursor(params: URLSearchParams): {
  beforeCreatedAt: string | null;
  beforeId: string | null;
} {
  const beforeCreatedAt = params.get("beforeCreatedAt");
  const beforeId = params.get("beforeId");
  if (
    beforeCreatedAt &&
    beforeId &&
    isUuid(beforeId) &&
    !Number.isNaN(Date.parse(beforeCreatedAt))
  ) {
    return { beforeCreatedAt, beforeId };
  }
  return { beforeCreatedAt: null, beforeId: null };
}
