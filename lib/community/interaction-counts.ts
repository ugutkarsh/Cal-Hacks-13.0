/**
 * Load real interest / reply counts via security-definer RPCs.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type InteractionCounts = {
  interestCount: number;
  replyCount: number;
  viewerInterested: boolean;
};

export async function loadInteractionCounts(
  supabase: SupabaseClient,
  postId: string,
  viewerId: string | null,
): Promise<InteractionCounts> {
  const [interestRes, replyRes, mineRes] = await Promise.all([
    supabase.rpc("community_post_interest_counts", {
      post_ids: [postId],
    }),
    supabase.rpc("community_post_reply_counts", {
      post_ids: [postId],
    }),
    viewerId
      ? supabase
          .from("community_post_interests")
          .select("id")
          .eq("post_id", postId)
          .eq("user_id", viewerId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const interestRows = (interestRes.data ?? []) as Array<{
    post_id: string;
    interest_count: number | string;
  }>;
  const replyRows = (replyRes.data ?? []) as Array<{
    post_id: string;
    reply_count: number | string;
  }>;

  const interestCount = Number(interestRows[0]?.interest_count ?? 0);
  const replyCount = Number(replyRows[0]?.reply_count ?? 0);

  return {
    interestCount: Number.isFinite(interestCount) ? interestCount : 0,
    replyCount: Number.isFinite(replyCount) ? replyCount : 0,
    viewerInterested: Boolean(mineRes.data),
  };
}
