import type { FeedbackEvent } from "@/types/feedback";
import type { FeedbackAction } from "@/types/feedback";

export type DbActivityFeedback = {
  id: string;
  user_id: string;
  activity_id: string;
  action: string;
  rating: number | null;
  activity_category: string | null;
  created_at: string;
};

export function mapDbFeedback(row: DbActivityFeedback): FeedbackEvent {
  return {
    id: row.id,
    activityId: row.activity_id,
    action: row.action as FeedbackAction,
    rating: row.rating,
    activityCategory: row.activity_category,
    createdAt: row.created_at,
    storage: "supabase",
  };
}

export const FEEDBACK_SELECT =
  "id, user_id, activity_id, action, rating, activity_category, created_at";
