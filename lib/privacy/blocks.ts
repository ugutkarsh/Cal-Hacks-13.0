/**
 * Shared block checks for interest, replies, recommendations, messaging.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { areUsersBlocked } from "@/lib/messaging/access";

export { areUsersBlocked };

export async function loadBlockedPeerIds(
  supabase: SupabaseClient,
  userId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("user_blocks")
    .select("blocker_id, blocked_id")
    .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);

  const out = new Set<string>();
  if (error || !data) return out;
  for (const row of data) {
    const blocker = row.blocker_id as string;
    const blocked = row.blocked_id as string;
    if (blocker === userId) out.add(blocked);
    else if (blocked === userId) out.add(blocker);
  }
  return out;
}

/** Filter people candidates so blocked peers never appear in recommendations. */
export function excludeBlockedIds<T extends { id: string }>(
  items: T[],
  blockedIds: Set<string>,
): T[] {
  if (blockedIds.size === 0) return items;
  return items.filter((item) => !blockedIds.has(item.id));
}
