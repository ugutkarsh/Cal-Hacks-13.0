/**
 * Database row shapes matching supabase/migrations/20261024120000_init.sql
 */

export type DbCategory =
  | "hiking"
  | "cycling"
  | "running"
  | "outdoor"
  | "meetup"
  | "climbing"
  | "sports"
  | "other";

export type DbSourceType = "community" | "apify" | "import" | "system";

export type DbRegistrationStatus = "registered" | "cancelled" | "waitlisted";

export type DbDmPolicy = "everyone" | "discoverable_only" | "nobody";

export type DbLocationShareLevel = "hidden" | "city_only" | "approximate";

export type DbSkillLevel = "beginner" | "intermediate" | "advanced" | "any";

export interface DbProfile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  city: string | null;
  neighborhood: string | null;
  discoverable: boolean;
  discovery_lat: number | null;
  discovery_lng: number | null;
  location_share_level?: DbLocationShareLevel;
  interests: string[] | null;
  skill_level: DbSkillLevel | null;
  availability_days: string[] | null;
  availability_start_hour: number | null;
  availability_end_hour: number | null;
  preferred_radius_km: number | null;
  dm_policy: DbDmPolicy;
  created_at: string;
  updated_at: string;
}

export interface DbPlace {
  id: string;
  name: string;
  description: string;
  category: string;
  latitude: number;
  longitude: number;
  image_url: string | null;
  source_type?: string;
  source_provider?: string | null;
  source_record_id?: string | null;
  source_url?: string | null;
  imported_at?: string | null;
  last_verified_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbActivity {
  id: string;
  title: string;
  description: string;
  category: string;
  place_id: string | null;
  organizer_id: string | null;
  starts_at: string;
  ends_at: string | null;
  capacity: number | null;
  image_url: string | null;
  source_type: string;
  source_url: string | null;
  source_provider: string | null;
  source_record_id: string | null;
  imported_at: string | null;
  last_verified_at: string | null;
  import_run_id: string | null;
  latitude: number | null;
  longitude: number | null;
  difficulty_label: string | null;
  /** Venue/address display when place relation is absent. */
  location_label: string | null;
  /** Meetup group / host name when organizer profile is absent. */
  host_label: string | null;
  /** Ticket/list price in USD cents when known from source; null = unknown. */
  cost_cents: number | null;
  created_at: string;
  updated_at: string;
}

/** Joined activity row as returned by our select. */
export interface DbActivityWithRelations extends DbActivity {
  places: Pick<DbPlace, "name" | "latitude" | "longitude" | "image_url"> | null;
  profiles: Pick<DbProfile, "display_name"> | null;
}

export type DbPostIntent =
  | "find_teammates"
  | "find_venue"
  | "join_activity"
  | "organize_meetup";

export type DbPostVisibility = "public" | "author_discoverable" | "private";

export type DbPostStatus = "open" | "closed" | "archived";

export interface DbCommunityPost {
  id: string;
  owner_id: string;
  message: string;
  activity: string | null;
  category: string | null;
  city: string | null;
  neighborhood: string | null;
  preferred_days: string[] | null;
  time_start_hour: number | null;
  time_end_hour: number | null;
  intent: DbPostIntent;
  skill_level: DbSkillLevel | null;
  budget_cents: number | null;
  radius_km: number | null;
  visibility: DbPostVisibility;
  status: DbPostStatus;
  created_at: string;
  updated_at: string;
}

/** Joined list/detail row with optional author profile (public fields only). */
export interface DbCommunityPostWithAuthor extends DbCommunityPost {
  profiles: Pick<
    DbProfile,
    | "id"
    | "display_name"
    | "avatar_url"
    | "city"
    | "neighborhood"
    | "discoverable"
  > | null;
}

export interface DbCommunityPostInterest {
  id: string;
  post_id: string;
  user_id: string;
  created_at: string;
}

export interface DbCommunityPostInterestWithUser extends DbCommunityPostInterest {
  profiles: Pick<
    DbProfile,
    | "id"
    | "display_name"
    | "avatar_url"
    | "city"
    | "neighborhood"
    | "discoverable"
  > | null;
}

export interface DbCommunityPostReply {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface DbCommunityPostReplyWithAuthor extends DbCommunityPostReply {
  profiles: Pick<
    DbProfile,
    | "id"
    | "display_name"
    | "avatar_url"
    | "city"
    | "neighborhood"
    | "discoverable"
  > | null;
}

export interface DbRegistrationCount {
  activity_id: string;
  registration_count: number;
}
