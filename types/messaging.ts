/**
 * Direct-message domain types. Bodies never appear on public post/profile APIs.
 */

export type ConversationSummary = {
  id: string;
  peerId: string;
  peerDisplayName: string;
  peerAvatarUrl: string | null;
  lastMessageBody: string | null;
  lastMessageAt: string | null;
  createdAt: string;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  /** True when sender is the current viewer. */
  isMine: boolean;
};

export type ConversationDetail = {
  conversation: ConversationSummary;
  messages: ChatMessage[];
  nextCursor: { createdAt: string; id: string } | null;
};

export const MESSAGE_BODY_MAX = 2000;
