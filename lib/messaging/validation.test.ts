import { describe, expect, it } from "vitest";
import { MESSAGE_BODY_MAX } from "@/types/messaging";
import {
  isUuid,
  parseLimit,
  parseMessageBody,
  parseMessageCursor,
  parseSendMessageBody,
  parseStartConversationBody,
} from "@/lib/messaging/validation";

const PEER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

describe("messaging validation", () => {
  it("accepts trimmed message bodies within limit", () => {
    const r = parseMessageBody("  hello trail  ");
    expect(r).toEqual({ ok: true, value: "hello trail" });
  });

  it("rejects empty and oversized bodies", () => {
    expect(parseMessageBody("   ").ok).toBe(false);
    expect(parseMessageBody("x".repeat(MESSAGE_BODY_MAX + 1)).ok).toBe(false);
  });

  it("ignores forged senderId when starting a conversation", () => {
    const r = parseStartConversationBody({
      peerId: PEER,
      senderId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      conversationId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    });
    expect(r).toEqual({ ok: true, value: { peerId: PEER } });
  });

  it("rejects invalid peerId", () => {
    expect(parseStartConversationBody({ peerId: "not-a-uuid" }).ok).toBe(
      false,
    );
  });

  it("parseSendMessageBody only returns body", () => {
    const r = parseSendMessageBody({
      body: "hi",
      senderId: "forged",
    });
    expect(r).toEqual({ ok: true, value: { body: "hi" } });
  });

  it("isUuid and limit helpers", () => {
    expect(isUuid(PEER)).toBe(true);
    expect(isUuid("x")).toBe(false);
    expect(parseLimit("999", 30, 50)).toBe(50);
    expect(parseLimit(null, 30, 50)).toBe(30);
  });

  it("parses message cursor only when both fields valid", () => {
    const ok = parseMessageCursor(
      new URLSearchParams({
        beforeCreatedAt: "2026-10-24T12:00:00.000Z",
        beforeId: PEER,
      }),
    );
    expect(ok.beforeId).toBe(PEER);
    const bad = parseMessageCursor(
      new URLSearchParams({ beforeCreatedAt: "nope", beforeId: PEER }),
    );
    expect(bad.beforeId).toBeNull();
  });
});
