/**
 * Map DB rows → messaging DTOs. Never leaks into public post/profile mappers.
 */

import type { ChatMessage, ConversationSummary } from "@/types/messaging";

export type DbMessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export type DbConversationListRow = {
  id: string;
  created_at: string;
  last_message_at: string | null;
  pair_key: string;
};

export function mapChatMessage(
  row: DbMessageRow,
  viewerId: string,
): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.body,
    createdAt: row.created_at,
    isMine: row.sender_id === viewerId,
  };
}

export function mapConversationSummary(input: {
  id: string;
  createdAt: string;
  lastMessageAt: string | null;
  lastMessageBody: string | null;
  peerId: string;
  peerDisplayName: string;
  peerAvatarUrl: string | null;
}): ConversationSummary {
  return {
    id: input.id,
    peerId: input.peerId,
    peerDisplayName: input.peerDisplayName,
    peerAvatarUrl: input.peerAvatarUrl,
    lastMessageBody: input.lastMessageBody,
    lastMessageAt: input.lastMessageAt,
    createdAt: input.createdAt,
  };
}

/** Peer id from sorted pair_key given the viewer. */
export function peerIdFromPairKey(pairKey: string, viewerId: string): string | null {
  const parts = pairKey.split(":");
  if (parts.length !== 2) return null;
  const [a, b] = parts;
  if (a === viewerId) return b;
  if (b === viewerId) return a;
  return null;
}
