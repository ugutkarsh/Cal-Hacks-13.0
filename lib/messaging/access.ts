/**
 * Conversation membership + block/dm_policy checks (server-side).
 * RLS is the primary gate; these helpers fail closed for API actions.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type MessagingAccessError =
  | "not_member"
  | "blocked"
  | "peer_unavailable"
  | "peer_rejects_messages"
  | "self"
  | "not_found";

export type MembershipCheck =
  | { ok: true }
  | { ok: false; error: MessagingAccessError };

export type PeerEligibility =
  | { ok: true; peer: { id: string; displayName: string; avatarUrl: string | null } }
  | { ok: false; error: MessagingAccessError };

/** Sorted pair key matching SQL dm_pair_key(). */
export function dmPairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export async function assertConversationMember(
  supabase: SupabaseClient,
  conversationId: string,
  userId: string,
): Promise<MembershipCheck> {
  const { data, error } = await supabase
    .from("conversation_members")
    .select("user_id")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: "not_member" };
  }
  return { ok: true };
}

export async function areUsersBlocked(
  supabase: SupabaseClient,
  a: string,
  b: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_blocks")
    .select("blocker_id")
    .or(
      `and(blocker_id.eq.${a},blocked_id.eq.${b}),and(blocker_id.eq.${b},blocked_id.eq.${a})`,
    )
    .limit(1);

  if (error) return true; // fail closed
  return Boolean(data && data.length > 0);
}

/**
 * Can `viewerId` start (or continue) a DM with `peerId`?
 * Uses profile row readable under RLS (own + discoverable peers).
 */
export async function checkPeerEligibleForDm(
  supabase: SupabaseClient,
  viewerId: string,
  peerId: string,
): Promise<PeerEligibility> {
  if (viewerId === peerId) {
    return { ok: false, error: "self" };
  }

  if (await areUsersBlocked(supabase, viewerId, peerId)) {
    return { ok: false, error: "blocked" };
  }

  const { data: peer, error } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, discoverable, dm_policy")
    .eq("id", peerId)
    .maybeSingle();

  if (error || !peer) {
    return { ok: false, error: "peer_unavailable" };
  }

  const policy =
    typeof peer.dm_policy === "string" ? peer.dm_policy : "discoverable_only";

  if (policy === "nobody") {
    return { ok: false, error: "peer_rejects_messages" };
  }
  if (policy === "discoverable_only" && !peer.discoverable) {
    return { ok: false, error: "peer_rejects_messages" };
  }

  return {
    ok: true,
    peer: {
      id: peer.id,
      displayName:
        typeof peer.display_name === "string" && peer.display_name.trim()
          ? peer.display_name.trim()
          : "Trailmap user",
      avatarUrl:
        typeof peer.avatar_url === "string" ? peer.avatar_url : null,
    },
  };
}

export function accessErrorStatus(error: MessagingAccessError): number {
  switch (error) {
    case "not_member":
    case "blocked":
    case "peer_rejects_messages":
    case "self":
      return 403;
    case "peer_unavailable":
    case "not_found":
      return 404;
    default:
      return 400;
  }
}

export function accessErrorMessage(error: MessagingAccessError): string {
  switch (error) {
    case "not_member":
      return "You are not a member of this conversation";
    case "blocked":
      return "Messaging is unavailable with this user";
    case "peer_unavailable":
      return "Recipient is unavailable";
    case "peer_rejects_messages":
      return "This user does not accept messages";
    case "self":
      return "Cannot message yourself";
    case "not_found":
      return "Conversation not found";
    default:
      return "Request denied";
  }
}
