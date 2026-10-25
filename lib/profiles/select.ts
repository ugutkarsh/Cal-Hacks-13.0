/** Column lists for profile queries (full vs pre-migration). */

export const PROFILE_SELECT_FULL =
  "id, display_name, avatar_url, bio, city, neighborhood, discoverable, discovery_lat, discovery_lng, location_share_level, interests, skill_level, availability_days, availability_start_hour, availability_end_hour, preferred_radius_km, dm_policy, created_at, updated_at";

export const PROFILE_SELECT_LEGACY =
  "id, display_name, avatar_url, bio, discoverable, discovery_lat, discovery_lng, interests, created_at";

export function isMissingColumnError(message: string | undefined): boolean {
  if (!message) return false;
  return /column .* does not exist/i.test(message) || /Could not find/i.test(message);
}
