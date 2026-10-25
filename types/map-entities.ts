/**
 * Shared domain types for map entities.
 * Designed to mirror future Supabase/PostGIS rows.
 */

export type EntityKind = "place" | "event" | "person";

export type ActivityCategory =
  | "hiking"
  | "cycling"
  | "running"
  | "outdoor"
  | "meetup"
  | "climbing"
  | "sports"
  | "other";

export type DataProvenance = "mock" | "supabase" | "apify" | "user";

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface MapEntityBase {
  id: string;
  kind: EntityKind;
  name: string;
  category: ActivityCategory;
  summary: string;
  locationLabel: string;
  coordinates: GeoPoint;
  imageUrl: string | null;
  /** Optional credit shown as a watermark on the detail hero image. */
  imageCredit: string | null;
  /** Always label mock vs real so UI never pretends sample data is live. */
  provenance: DataProvenance;
  createdAt: string;
}

export interface PlaceEntity extends MapEntityBase {
  kind: "place";
  amenities: string[];
  rating: number | null;
  reviewCount: number;
}

export interface EventEntity extends MapEntityBase {
  kind: "event";
  startsAt: string;
  endsAt: string;
  organizerName: string;
  organizerId: string;
  /** Original listing URL when imported (e.g. Meetup). */
  sourceUrl: string | null;
  capacity: number;
  attendeeCount: number;
  attendeesPreview: string[];
  reviews: EventReview[];
  isRegistrationOpen: boolean;
  /** Short level line shown under meta icons, e.g. "Beginner-friendly". */
  difficultyLabel: string;
  /**
   * Activity cost in USD cents. `null` means unknown — recommenders must not
   * treat unknown as within-budget.
   */
  costCents: number | null;
}

export interface PersonEntity extends MapEntityBase {
  kind: "person";
  /** Discovery is opt-in only; never invent live presence. */
  discoveryOptIn: true;
  interests: ActivityCategory[];
  bio: string;
  /** Explicitly not a live GPS ping — sample profile pin for UI only when mock. */
  presenceNote: string;
}

export interface EventReview {
  id: string;
  authorName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export type MapEntity = PlaceEntity | EventEntity | PersonEntity;

export type CategoryFilter = ActivityCategory | "all";

export interface MapDiscoveryQuery {
  search: string;
  category: CategoryFilter;
  kinds: EntityKind[];
}

export interface DataSourceMeta {
  /** Active data-access mode (not the same as per-entity provenance). */
  mode: "demo" | "supabase";
  label: string;
  fetchedAt: string | null;
}
