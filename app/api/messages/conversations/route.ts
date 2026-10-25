/**
 * List the caller's conversations, or start/reuse a 1:1 DM.
 * Sender/membership always derived from auth — never from body.
 */

import { NextResponse } from "next/server";
import {
  accessErrorMessage,
  accessErrorStatus,
  checkPeerEligibleForDm,
} from "@/lib/messaging/access";
import { requireMessagingUser } from "@/lib/messaging/auth";
import {
  mapConversationSummary,
  peerIdFromPairKey,
} from "@/lib/messaging/mappers";
import {
  CONVERSATION_LIST_DEFAULT_LIMIT,
  CONVERSATION_LIST_MAX_LIMIT,
  parseLimit,
  parseStartConversationBody,
} from "@/lib/messaging/validation";
import {
  checkRateLimit,
  rateLimitExceededResponse,
} from "@/lib/privacy/rate-limit";
import { publicApiError } from "@/lib/privacy/safe-error";
import type { ConversationSummary } from "@/types/messaging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireMessagingUser();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const url = new URL(request.url);
  const limit = parseLimit(
    url.searchParams.get("limit"),
    CONVERSATION_LIST_DEFAULT_LIMIT,
    CONVERSATION_LIST_MAX_LIMIT,
  );

  const { data: memberships, error: memErr } = await supabase
    .from("conversation_members")
    .select("conversation_id")
    .eq("user_id", user.id);

  if (memErr) {
    return NextResponse.json(
      { ok: false, error: publicApiError("Could not load conversations", memErr) },
      { status: 500 },
    );
  }

  const ids = (memberships ?? []).map((m) => m.conversation_id as string);
  if (ids.length === 0) {
    return NextResponse.json({ ok: true, conversations: [] as ConversationSummary[] });
  }

  const { data: conversations, error: convErr } = await supabase
    .from("conversations")
    .select("id, pair_key, created_at, last_message_at")
    .in("id", ids)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (convErr) {
    return NextResponse.json(
      {
        ok: false,
        error: publicApiError("Could not load conversations", convErr),
      },
      { status: 500 },
    );
  }

  const rows = conversations ?? [];
  const peerIds = rows
    .map((c) => peerIdFromPairKey(c.pair_key as string, user.id))
    .filter((id): id is string => Boolean(id));

  const profileById = new Map<
    string,
    { display_name: string | null; avatar_url: string | null }
  >();
  if (peerIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", peerIds);
    for (const p of profiles ?? []) {
      profileById.set(p.id as string, {
        display_name: (p.display_name as string | null) ?? null,
        avatar_url: (p.avatar_url as string | null) ?? null,
      });
    }
  }

  // Latest message preview per conversation (small N).
  const lastBodyByConv = new Map<string, string>();
  await Promise.all(
    rows.map(async (c) => {
      const { data: last } = await supabase
        .from("messages")
        .select("body")
        .eq("conversation_id", c.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (last?.body) lastBodyByConv.set(c.id as string, last.body as string);
    }),
  );

  const summaries: ConversationSummary[] = [];
  for (const c of rows) {
    const peerId = peerIdFromPairKey(c.pair_key as string, user.id);
    if (!peerId) continue;
    const profile = profileById.get(peerId);
    summaries.push(
      mapConversationSummary({
        id: c.id as string,
        createdAt: c.created_at as string,
        lastMessageAt: (c.last_message_at as string | null) ?? null,
        lastMessageBody: lastBodyByConv.get(c.id as string) ?? null,
        peerId,
        peerDisplayName:
          profile?.display_name?.trim() ||
          (profile ? "Trailmap user" : "Unavailable user"),
        peerAvatarUrl: profile?.avatar_url ?? null,
      }),
    );
  }

  return NextResponse.json({ ok: true, conversations: summaries });
}

export async function POST(request: Request) {
  const auth = await requireMessagingUser();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = parseStartConversationBody(json);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: parsed.error },
      { status: 400 },
    );
  }

  const limited = checkRateLimit("conversation_start", user.id);
  if (!limited.ok) {
    const r = rateLimitExceededResponse(limited.retryAfterSec);
    return NextResponse.json(r.body, { status: r.status, headers: r.headers });
  }

  const eligibility = await checkPeerEligibleForDm(
    supabase,
    user.id,
    parsed.value.peerId,
  );
  if (!eligibility.ok) {
    return NextResponse.json(
      { ok: false, error: accessErrorMessage(eligibility.error) },
      { status: accessErrorStatus(eligibility.error) },
    );
  }

  const { data: conversationId, error: rpcErr } = await supabase.rpc(
    "start_direct_conversation",
    { peer_id: parsed.value.peerId },
  );

  if (rpcErr || !conversationId) {
    const msg = rpcErr?.message ?? "Could not start conversation";
    const lower = msg.toLowerCase();
    let status = 400;
    if (lower.includes("blocked") || lower.includes("does not accept")) {
      status = 403;
    } else if (lower.includes("not found") || lower.includes("unavailable")) {
      status = 404;
    } else if (lower.includes("not authenticated")) {
      status = 401;
    }
    return NextResponse.json(
      {
        ok: false,
        error: lower.includes("blocked")
          ? accessErrorMessage("blocked")
          : lower.includes("does not accept")
            ? accessErrorMessage("peer_rejects_messages")
            : msg,
      },
      { status },
    );
  }

  const summary = mapConversationSummary({
    id: conversationId as string,
    createdAt: new Date().toISOString(),
    lastMessageAt: null,
    lastMessageBody: null,
    peerId: eligibility.peer.id,
    peerDisplayName: eligibility.peer.displayName,
    peerAvatarUrl: eligibility.peer.avatarUrl,
  });

  return NextResponse.json(
    { ok: true, conversation: summary },
    { status: 201 },
  );
}
