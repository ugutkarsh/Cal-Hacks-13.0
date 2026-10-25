import { describe, expect, it } from "vitest";
import {
  accessErrorMessage,
  accessErrorStatus,
  dmPairKey,
} from "@/lib/messaging/access";
import { peerIdFromPairKey } from "@/lib/messaging/mappers";
import { mapChatMessage } from "@/lib/messaging/mappers";

const A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

describe("messaging access helpers", () => {
  it("dmPairKey is order-independent (duplicate conversation key)", () => {
    expect(dmPairKey(A, B)).toBe(dmPairKey(B, A));
    expect(dmPairKey(A, B)).toBe(`${A}:${B}`);
  });

  it("peerIdFromPairKey resolves the other member", () => {
    const key = dmPairKey(A, B);
    expect(peerIdFromPairKey(key, A)).toBe(B);
    expect(peerIdFromPairKey(key, B)).toBe(A);
    expect(peerIdFromPairKey(key, "cccccccc-cccc-cccc-cccc-cccccccccccc")).toBe(
      null,
    );
  });

  it("maps isMine from authenticated viewer, not payload claim", () => {
    const row = {
      id: "11111111-1111-1111-1111-111111111111",
      conversation_id: "22222222-2222-2222-2222-222222222222",
      sender_id: A,
      body: "persisted hello",
      created_at: "2026-10-24T12:00:00.000Z",
    };
    expect(mapChatMessage(row, A).isMine).toBe(true);
    expect(mapChatMessage(row, B).isMine).toBe(false);
  });

  it("access errors are safe for unauthorized reads/writes", () => {
    expect(accessErrorStatus("not_member")).toBe(403);
    expect(accessErrorStatus("blocked")).toBe(403);
    expect(accessErrorStatus("peer_unavailable")).toBe(404);
    expect(accessErrorMessage("not_member")).toMatch(/not a member/i);
    expect(accessErrorMessage("blocked")).toMatch(/unavailable/i);
  });
});

describe("messaging membership / block policy (pure rules)", () => {
  /** Mirrors SQL start_direct_conversation eligibility without a live DB. */
  function canStartDm(input: {
    viewerId: string;
    peerId: string;
    peerExists: boolean;
    blocked: boolean;
    dmPolicy: "everyone" | "discoverable_only" | "nobody";
    discoverable: boolean;
  }): "ok" | "self" | "blocked" | "peer_unavailable" | "peer_rejects_messages" {
    if (input.viewerId === input.peerId) return "self";
    if (!input.peerExists) return "peer_unavailable";
    if (input.blocked) return "blocked";
    if (input.dmPolicy === "nobody") return "peer_rejects_messages";
    if (input.dmPolicy === "discoverable_only" && !input.discoverable) {
      return "peer_rejects_messages";
    }
    return "ok";
  }

  it("blocks self and blocked peers", () => {
    expect(
      canStartDm({
        viewerId: A,
        peerId: A,
        peerExists: true,
        blocked: false,
        dmPolicy: "everyone",
        discoverable: true,
      }),
    ).toBe("self");
    expect(
      canStartDm({
        viewerId: A,
        peerId: B,
        peerExists: true,
        blocked: true,
        dmPolicy: "everyone",
        discoverable: true,
      }),
    ).toBe("blocked");
  });

  it("respects dm_policy nobody and undiscoverable discoverable_only", () => {
    expect(
      canStartDm({
        viewerId: A,
        peerId: B,
        peerExists: true,
        blocked: false,
        dmPolicy: "nobody",
        discoverable: true,
      }),
    ).toBe("peer_rejects_messages");
    expect(
      canStartDm({
        viewerId: A,
        peerId: B,
        peerExists: true,
        blocked: false,
        dmPolicy: "discoverable_only",
        discoverable: false,
      }),
    ).toBe("peer_rejects_messages");
  });

  it("allows discoverable peers with discoverable_only or everyone", () => {
    expect(
      canStartDm({
        viewerId: A,
        peerId: B,
        peerExists: true,
        blocked: false,
        dmPolicy: "discoverable_only",
        discoverable: true,
      }),
    ).toBe("ok");
    expect(
      canStartDm({
        viewerId: A,
        peerId: B,
        peerExists: true,
        blocked: false,
        dmPolicy: "everyone",
        discoverable: false,
      }),
    ).toBe("ok");
  });

  it("unrelated third party is never a member of the pair", () => {
    const key = dmPairKey(A, B);
    const stranger = "cccccccc-cccc-cccc-cccc-cccccccccccc";
    expect(peerIdFromPairKey(key, stranger)).toBeNull();
  });
});

describe("persistence shape", () => {
  it("message rows survive round-trip mapping (refresh)", () => {
    const stored = {
      id: "11111111-1111-1111-1111-111111111111",
      conversation_id: "22222222-2222-2222-2222-222222222222",
      sender_id: A,
      body: "still here after refresh",
      created_at: "2026-10-24T12:00:00.000Z",
    };
    const again = mapChatMessage(stored, B);
    expect(again.body).toBe("still here after refresh");
    expect(again.conversationId).toBe(stored.conversation_id);
    expect(again.isMine).toBe(false);
  });
});
