import { describe, expect, it } from "vitest";
import {
  mapChatMessage,
  mapConversationSummary,
  peerIdFromPairKey,
} from "@/lib/messaging/mappers";
import { dmPairKey } from "@/lib/messaging/access";

const A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

describe("messaging mappers", () => {
  it("does not expose private bodies via summary without lastMessageBody", () => {
    const summary = mapConversationSummary({
      id: "22222222-2222-2222-2222-222222222222",
      createdAt: "2026-10-24T12:00:00.000Z",
      lastMessageAt: null,
      lastMessageBody: null,
      peerId: B,
      peerDisplayName: "Blake",
      peerAvatarUrl: null,
    });
    expect(summary.lastMessageBody).toBeNull();
    expect(JSON.stringify(summary)).not.toMatch(/sender/i);
  });

  it("chronological mapping preserves createdAt", () => {
    const m = mapChatMessage(
      {
        id: "11111111-1111-1111-1111-111111111111",
        conversation_id: "22222222-2222-2222-2222-222222222222",
        sender_id: A,
        body: "first",
        created_at: "2026-10-24T10:00:00.000Z",
      },
      A,
    );
    expect(m.createdAt).toBe("2026-10-24T10:00:00.000Z");
  });

  it("pair key membership is exclusive to the two peers", () => {
    const key = dmPairKey(A, B);
    expect(peerIdFromPairKey(key, A)).toBe(B);
    expect(peerIdFromPairKey("bogus", A)).toBeNull();
  });
});
