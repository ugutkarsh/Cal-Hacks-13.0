"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, MessageCircle, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { MESSAGE_BODY_MAX } from "@/types/messaging";
import type { ChatMessage, ConversationSummary } from "@/types/messaging";

type View = "list" | "thread";
type LoadState = "idle" | "loading" | "ready" | "error";
type SendState = "idle" | "sending" | "failed";

interface MessagesPanelProps {
  open: boolean;
  signedIn: boolean;
  viewerId?: string | null;
  /** When set, open/start a thread with this peer after panel mounts. */
  startWithPeerId?: string | null;
  onClose: () => void;
  onRequestSignIn: () => void;
  onConsumedStartPeer?: () => void;
}

export function MessagesPanel({
  open,
  signedIn,
  viewerId,
  startWithPeerId,
  onClose,
  onRequestSignIn,
  onConsumedStartPeer,
}: MessagesPanelProps) {
  const [view, setView] = useState<View>("list");
  const [conversations, setConversations] = useState<ConversationSummary[]>(
    [],
  );
  const [listState, setListState] = useState<LoadState>("idle");
  const [listError, setListError] = useState<string | null>(null);

  const [active, setActive] = useState<ConversationSummary | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threadState, setThreadState] = useState<LoadState>("idle");
  const [threadError, setThreadError] = useState<string | null>(null);

  const [draft, setDraft] = useState("");
  const [sendState, setSendState] = useState<SendState>("idle");
  const [sendError, setSendError] = useState<string | null>(null);
  const [realtimeActive, setRealtimeActive] = useState(false);
  const [safetyNote, setSafetyNote] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const startingRef = useRef(false);

  async function submitReport(
    targetType: "profile" | "message",
    targetId: string,
  ) {
    const reason = window.prompt(
      "Report reason: spam, harassment, inappropriate, impersonation, safety, or other.\nReporting does not guarantee removal.",
      "spam",
    );
    if (!reason) return;
    const normalized = reason.trim().toLowerCase();
    const allowed = [
      "spam",
      "harassment",
      "inappropriate",
      "impersonation",
      "safety",
      "other",
    ];
    if (!allowed.includes(normalized)) {
      setSafetyNote("Pick a listed report reason");
      return;
    }
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType,
          targetId,
          reason: normalized,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        alreadyReported?: boolean;
        message?: string;
      };
      if (!res.ok || !json.ok) {
        setSafetyNote(json.error ?? "Could not submit report");
        return;
      }
      setSafetyNote(
        json.message ??
          "Report submitted. Reporting does not guarantee removal.",
      );
    } catch {
      setSafetyNote(
        "Could not submit report — try again. Nothing was auto-removed.",
      );
    }
  }

  const loadConversations = useCallback(async () => {
    setListState("loading");
    setListError(null);
    try {
      const res = await fetch("/api/messages/conversations");
      const json = (await res.json()) as {
        ok: boolean;
        error?: string;
        conversations?: ConversationSummary[];
      };
      if (!res.ok || !json.ok) {
        setListError(json.error ?? "Could not load conversations");
        setListState("error");
        return;
      }
      setConversations(json.conversations ?? []);
      setListState("ready");
    } catch {
      setListError("Network error loading conversations");
      setListState("error");
    }
  }, []);

  const loadThread = useCallback(async (conversationId: string) => {
    setThreadState("loading");
    setThreadError(null);
    try {
      const res = await fetch(
        `/api/messages/conversations/${conversationId}`,
      );
      const json = (await res.json()) as {
        ok: boolean;
        error?: string;
        conversation?: ConversationSummary;
        messages?: ChatMessage[];
      };
      if (!res.ok || !json.ok || !json.conversation) {
        setThreadError(json.error ?? "Could not load messages");
        setThreadState("error");
        return;
      }
      setActive(json.conversation);
      setMessages(json.messages ?? []);
      setThreadState("ready");
    } catch {
      setThreadError("Network error loading messages");
      setThreadState("error");
    }
  }, []);

  const openConversation = useCallback(
    async (summary: ConversationSummary) => {
      setView("thread");
      setActive(summary);
      setDraft("");
      setSendState("idle");
      setSendError(null);
      await loadThread(summary.id);
    },
    [loadThread],
  );

  const startWithPeer = useCallback(
    async (peerId: string) => {
      if (startingRef.current) return;
      startingRef.current = true;
      setView("thread");
      setThreadState("loading");
      setThreadError(null);
      try {
        const res = await fetch("/api/messages/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ peerId }),
        });
        const json = (await res.json()) as {
          ok: boolean;
          error?: string;
          conversation?: ConversationSummary;
        };
        if (!res.ok || !json.ok || !json.conversation) {
          setThreadError(json.error ?? "Could not start conversation");
          setThreadState("error");
          return;
        }
        setActive(json.conversation);
        await loadThread(json.conversation.id);
        void loadConversations();
      } catch {
        setThreadError("Network error starting conversation");
        setThreadState("error");
      } finally {
        startingRef.current = false;
        onConsumedStartPeer?.();
      }
    },
    [loadConversations, loadThread, onConsumedStartPeer],
  );

  useEffect(() => {
    if (!open) return;
    if (!signedIn) {
      setView("list");
      setConversations([]);
      setListState("idle");
      return;
    }
    const t = window.setTimeout(() => {
      void loadConversations();
    }, 0);
    return () => window.clearTimeout(t);
  }, [open, signedIn, loadConversations]);

  useEffect(() => {
    if (!open || !signedIn || !startWithPeerId) return;
    void startWithPeer(startWithPeerId);
  }, [open, signedIn, startWithPeerId, startWithPeer]);

  // Realtime + light poll fallback while a thread is open.
  useEffect(() => {
    if (!open || view !== "thread" || !active?.id || !signedIn) {
      setRealtimeActive(false);
      return;
    }

    const conversationId = active.id;
    const me = viewerId ?? null;
    const client = getSupabaseBrowserClient();
    let channel: ReturnType<NonNullable<typeof client>["channel"]> | null =
      null;
    let subscribed = false;

    if (client) {
      channel = client
        .channel(`dm:${conversationId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `conversation_id=eq.${conversationId}`,
          },
          (payload) => {
            const row = payload.new as {
              id?: string;
              conversation_id?: string;
              sender_id?: string;
              body?: string;
              created_at?: string;
            };
            if (!row?.id || !row.body || !row.sender_id || !row.created_at) {
              return;
            }
            setMessages((prev) => {
              if (prev.some((m) => m.id === row.id)) return prev;
              return [
                ...prev,
                {
                  id: row.id!,
                  conversationId: row.conversation_id ?? conversationId,
                  senderId: row.sender_id!,
                  body: row.body!,
                  createdAt: row.created_at!,
                  isMine: me != null && row.sender_id === me,
                },
              ];
            });
            setRealtimeActive(true);
          },
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            subscribed = true;
            setRealtimeActive(true);
          }
        });
    }

    const pollTimer = window.setInterval(() => {
      // Poll less often once Realtime is confirmed.
      if (subscribed) return;
      void loadThread(conversationId);
    }, 8000);

    // Slow safety refresh even with Realtime (reconnect gaps).
    const safetyTimer = window.setInterval(() => {
      void loadThread(conversationId);
    }, 45000);

    return () => {
      if (pollTimer) window.clearInterval(pollTimer);
      window.clearInterval(safetyTimer);
      if (channel && client) {
        void client.removeChannel(channel);
      }
    };
  }, [open, view, active?.id, signedIn, viewerId, loadThread]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, view]);

  async function sendMessage() {
    if (!active || sendState === "sending") return;
    const body = draft.trim();
    if (!body) return;
    if (body.length > MESSAGE_BODY_MAX) {
      setSendError(`Max ${MESSAGE_BODY_MAX} characters`);
      setSendState("failed");
      return;
    }

    setSendState("sending");
    setSendError(null);
    const optimisticId = `local-${Date.now()}`;
    const optimistic: ChatMessage = {
      id: optimisticId,
      conversationId: active.id,
      senderId: "me",
      body,
      createdAt: new Date().toISOString(),
      isMine: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    setDraft("");

    try {
      const res = await fetch(`/api/messages/conversations/${active.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        error?: string;
        message?: ChatMessage;
      };
      if (!res.ok || !json.ok || !json.message) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        setDraft(body);
        setSendError(json.error ?? "Failed to send");
        setSendState("failed");
        return;
      }
      setMessages((prev) =>
        prev.map((m) => (m.id === optimisticId ? json.message! : m)),
      );
      setSendState("idle");
      void loadConversations();
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setDraft(body);
      setSendError("Network error — message not sent");
      setSendState("failed");
    }
  }

  if (!open) return null;

  return (
    <div className="pointer-events-auto absolute bottom-3 left-3 right-3 z-40 sm:bottom-4 sm:left-auto sm:right-4 sm:w-[380px]">
      <div className="flex max-h-[min(78dvh,640px)] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]/95 shadow-xl backdrop-blur-md">
        <div
          className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3"
          style={{
            background:
              "linear-gradient(120deg, var(--brand-deep) 0%, var(--brand-mid) 55%, var(--brand-mist) 100%)",
          }}
        >
          <div className="flex min-w-0 items-center gap-2">
            {view === "thread" && (
              <Button
                type="button"
                variant="secondary"
                size="icon"
                aria-label="Back to conversations"
                className="h-8 w-8 shrink-0 border-white/20 bg-white/15 text-white hover:bg-white/25"
                onClick={() => {
                  setView("list");
                  setActive(null);
                  setMessages([]);
                  void loadConversations();
                }}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div className="min-w-0">
              <p className="font-[family-name:var(--font-display)] text-lg font-semibold text-white">
                {view === "thread" && active
                  ? active.peerDisplayName
                  : "Messages"}
              </p>
              <p className="truncate text-[11px] text-white/75">
                {view === "thread"
                  ? realtimeActive
                    ? "Live updates on"
                    : "Private · refreshes while open"
                  : "Private one-to-one chats"}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {view === "thread" && active && signedIn && (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-8 border-white/20 bg-white/15 px-2 text-[10px] text-white hover:bg-white/25"
                  onClick={() => void submitReport("profile", active.peerId)}
                >
                  Report user
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-8 border-white/20 bg-white/15 px-2 text-[10px] text-white hover:bg-white/25"
                  onClick={() => {
                    if (
                      !window.confirm(
                        "Block this user? They won’t be able to message you.",
                      )
                    ) {
                      return;
                    }
                    void fetch("/api/blocks", {
                      method: "POST",
                      credentials: "include",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ userId: active.peerId }),
                    }).then(() => {
                      setView("list");
                      setActive(null);
                      void loadConversations();
                    });
                  }}
                >
                  Block
                </Button>
              </>
            )}
            <Button
              type="button"
              variant="secondary"
              size="icon"
              aria-label="Close messages"
              className="h-8 w-8 border-white/20 bg-white/15 text-white hover:bg-white/25"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {!signedIn ? (
          <div className="space-y-3 px-4 py-8 text-center">
            <MessageCircle className="mx-auto h-8 w-8 text-[var(--muted)]" />
            <p className="text-sm text-[var(--muted)]">
              Sign in to send and receive private messages.
            </p>
            <Button type="button" onClick={onRequestSignIn}>
              Sign in
            </Button>
          </div>
        ) : view === "list" ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {listState === "loading" && conversations.length === 0 && (
              <p className="px-1 text-sm text-[var(--muted)]">
                Loading conversations…
              </p>
            )}
            {listState === "error" && (
              <div className="space-y-2 px-1">
                <p className="text-sm text-red-600">{listError}</p>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => void loadConversations()}
                >
                  Retry
                </Button>
              </div>
            )}
            {listState === "ready" && conversations.length === 0 && (
              <div className="rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-center">
                <MessageCircle className="mx-auto mb-2 h-6 w-6 text-[var(--muted)]" />
                <p className="text-sm text-[var(--muted)]">
                  No conversations yet. Message someone from a community post
                  or people recommendation when they accept DMs.
                </p>
              </div>
            )}
            <ul className="space-y-2">
              {conversations.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => void openConversation(c)}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2.5 text-left transition-colors hover:bg-[var(--surface-hover)]"
                  >
                    <p className="text-sm font-medium text-[var(--foreground)]">
                      {c.peerDisplayName}
                    </p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-[var(--muted)]">
                      {c.lastMessageBody ?? "No messages yet"}
                    </p>
                    {c.lastMessageAt && (
                      <p className="mt-1 text-[10px] text-[var(--muted)]">
                        {new Date(c.lastMessageAt).toLocaleString()}
                      </p>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
              {threadState === "loading" && messages.length === 0 && (
                <p className="text-sm text-[var(--muted)]">Loading messages…</p>
              )}
              {threadState === "error" && (
                <div className="space-y-2">
                  <p className="text-sm text-red-600">{threadError}</p>
                  {active && (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => void loadThread(active.id)}
                    >
                      Retry
                    </Button>
                  )}
                </div>
              )}
              {threadState === "ready" && messages.length === 0 && (
                <p className="text-center text-sm text-[var(--muted)]">
                  Say hello — messages stay private to this conversation.
                </p>
              )}
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "flex",
                    m.isMine ? "justify-end" : "justify-start",
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                      m.isMine
                        ? "bg-[var(--brand-mid)] text-white"
                        : "border border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--foreground)]",
                      m.id.startsWith("local-") && "opacity-70",
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <div
                      className={cn(
                        "mt-1 flex items-center gap-2 text-[10px]",
                        m.isMine ? "text-white/70" : "text-[var(--muted)]",
                      )}
                    >
                      <span>
                        {new Date(m.createdAt).toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                      {!m.isMine &&
                        signedIn &&
                        !m.id.startsWith("local-") && (
                          <button
                            type="button"
                            className="underline-offset-2 hover:underline"
                            onClick={() => void submitReport("message", m.id)}
                          >
                            Report
                          </button>
                        )}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            <div className="border-t border-[var(--border)] px-3 py-2">
              {safetyNote && (
                <p className="mb-1.5 text-xs text-[var(--muted)]" role="status">
                  {safetyNote}
                </p>
              )}
              {sendState === "failed" && sendError && (
                <p className="mb-1.5 text-xs text-red-600">{sendError}</p>
              )}
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendMessage();
                }}
              >
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Write a message…"
                  maxLength={MESSAGE_BODY_MAX}
                  disabled={threadState === "error" || !active}
                  aria-label="Message body"
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={
                    !draft.trim() ||
                    sendState === "sending" ||
                    threadState === "error" ||
                    !active
                  }
                  aria-label="Send message"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </form>
              {sendState === "sending" && (
                <p className="mt-1 text-[10px] text-[var(--muted)]">Sending…</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
