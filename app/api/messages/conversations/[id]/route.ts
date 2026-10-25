/**
 * Conversation message history + send.
 * Membership validated server-side; sender_id always = auth.uid().
 */

import { NextResponse } from "next/server";
import {
  accessErrorMessage,
  accessErrorStatus,
  areUsersBlocked,
  assertConversationMember,
} from "@/lib/messaging/access";
import { requireMessagingUser } from "@/lib/messaging/auth";
import {
  mapChatMessage,
  mapConversationSummary,
  peerIdFromPairKey,
  type DbMessageRow,
} from "@/lib/messaging/mappers";
import {
  MESSAGE_LIST_DEFAULT_LIMIT,
  MESSAGE_LIST_MAX_LIMIT,
  parseLimit,
  parseMessageCursor,
  parseSendMessageBody,
} from "@/lib/messaging/validation";
import {
  checkRateLimit,
  rateLimitExceededResponse,
} from "@/lib/privacy/rate-limit";
import { publicApiError } from "@/lib/privacy/safe-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireMessagingUser();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;
  const { id: conversationId } = await context.params;

  const membership = await assertConversationMember(
    supabase,
    conversationId,
    user.id,
  );
  if (!membership.ok) {
    return NextResponse.json(
      { ok: false, error: accessErrorMessage(membership.error) },
      { status: accessErrorStatus(membership.error) },
    );
  }

  const { data: conversation, error: convErr } = await supabase
    .from("conversations")
    .select("id, pair_key, created_at, last_message_at")
    .eq("id", conversationId)
    .maybeSingle();

  if (convErr || !conversation) {
    return NextResponse.json(
      { ok: false, error: accessErrorMessage("not_found") },
      { status: 404 },
    );
  }

  const peerId = peerIdFromPairKey(
    conversation.pair_key as string,
    user.id,
  );
  if (!peerId) {
    return NextResponse.json(
      { ok: false, error: accessErrorMessage("not_member") },
      { status: 403 },
    );
  }

  const { data: peerProfile } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url")
    .eq("id", peerId)
    .maybeSingle();

  const url = new URL(request.url);
  const limit = parseLimit(
    url.searchParams.get("limit"),
    MESSAGE_LIST_DEFAULT_LIMIT,
    MESSAGE_LIST_MAX_LIMIT,
  );
  const cursor = parseMessageCursor(url.searchParams);

  let query = supabase
    .from("messages")
    .select("id, conversation_id, sender_id, body, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (cursor.beforeCreatedAt && cursor.beforeId) {
    query = query.or(
      `created_at.lt.${cursor.beforeCreatedAt},and(created_at.eq.${cursor.beforeCreatedAt},id.lt.${cursor.beforeId})`,
    );
  }

  const { data: rows, error: msgErr } = await query;
  if (msgErr) {
    return NextResponse.json(
      { ok: false, error: msgErr.message },
      { status: 500 },
    );
  }

  const page = (rows ?? []) as DbMessageRow[];
  const hasMore = page.length > limit;
  const slice = hasMore ? page.slice(0, limit) : page;
  // Chronological for the UI.
  const chronological = [...slice].reverse();
  const messages = chronological.map((r) => mapChatMessage(r, user.id));

  const oldest = slice[slice.length - 1];
  const nextCursor =
    hasMore && oldest
      ? { createdAt: oldest.created_at, id: oldest.id }
      : null;

  const summary = mapConversationSummary({
    id: conversation.id as string,
    createdAt: conversation.created_at as string,
    lastMessageAt: (conversation.last_message_at as string | null) ?? null,
    lastMessageBody: messages.length
      ? messages[messages.length - 1]!.body
      : null,
    peerId,
    peerDisplayName:
      peerProfile?.display_name?.trim() ||
      (peerProfile ? "Trailmap user" : "Unavailable user"),
    peerAvatarUrl: (peerProfile?.avatar_url as string | null) ?? null,
  });

  return NextResponse.json({
    ok: true,
    conversation: summary,
    messages,
    nextCursor,
  });
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireMessagingUser();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;
  const { id: conversationId } = await context.params;

  const membership = await assertConversationMember(
    supabase,
    conversationId,
    user.id,
  );
  if (!membership.ok) {
    return NextResponse.json(
      { ok: false, error: accessErrorMessage(membership.error) },
      { status: accessErrorStatus(membership.error) },
    );
  }

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, pair_key")
    .eq("id", conversationId)
    .maybeSingle();

  if (!conversation) {
    return NextResponse.json(
      { ok: false, error: accessErrorMessage("not_found") },
      { status: 404 },
    );
  }

  const peerId = peerIdFromPairKey(
    conversation.pair_key as string,
    user.id,
  );
  if (!peerId) {
    return NextResponse.json(
      { ok: false, error: accessErrorMessage("not_member") },
      { status: 403 },
    );
  }

  if (await areUsersBlocked(supabase, user.id, peerId)) {
    return NextResponse.json(
      { ok: false, error: accessErrorMessage("blocked") },
      { status: 403 },
    );
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

  const parsed = parseSendMessageBody(json);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: parsed.error },
      { status: 400 },
    );
  }

  const limited = checkRateLimit("message_send", user.id);
  if (!limited.ok) {
    const r = rateLimitExceededResponse(limited.retryAfterSec);
    return NextResponse.json(r.body, { status: r.status, headers: r.headers });
  }

  // Never trust client senderId — always auth.uid().
  const { data: inserted, error: insertErr } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: user.id,
      body: parsed.value.body,
    })
    .select("id, conversation_id, sender_id, body, created_at")
    .single();

  if (insertErr || !inserted) {
    return NextResponse.json(
      {
        ok: false,
        error: publicApiError("Failed to send message", insertErr),
      },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      message: mapChatMessage(inserted as DbMessageRow, user.id),
    },
    { status: 201 },
  );
}
