/**
 * Recommendations grounded in a community post + real catalog records.
 */

import type { RecommendationMethod, RecommendationReason } from "@/types/recommendations";
import type { ActivityCategory, GeoPoint } from "@/types/map-entities";
import type { DayOfWeek, SkillPreference } from "@/types/preferences";
import type { PostIntent } from "@/types/community-post";

export type PlaceRecKind = "venue" | "event";

export type PostPlaceRecommendation = {
  id: string;
  kind: PlaceRecKind;
  name: string;
  summary: string;
  category: ActivityCategory;
  locationLabel: string;
  coordinates: GeoPoint;
  sourceUrl: string | null;
  provenance: string;
  score: number;
  reasons: RecommendationReason[];
  /**
   * Honest availability note — never claims open/bookable unless verified.
   */
  availabilityNote: string;
};

export type PostPeopleRecommendation = {
  id: string;
  displayName: string;
  bio: string | null;
  city: string | null;
  neighborhood: string | null;
  interests: string[];
  skillLevel: SkillPreference | null;
  /** Fuzzed approximate pin only. */
  discoveryLat: number;
  discoveryLng: number;
  acceptsMessages: boolean;
  presenceNote: string;
  score: number;
  reasons: RecommendationReason[];
  /**
   * Only true when they have an active open post seeking teammates/venue.
   * Never inferred from interests alone.
   */
  activelyLooking: boolean;
  activelyLookingNote: string | null;
};

export type PostRecommendationsResult = {
  postId: string;
  /** Echo of structured fields used for matching. */
  query: {
    activity: string | null;
    category: ActivityCategory | null;
    city: string | null;
    preferredDays: DayOfWeek[];
    timeStartHour: number | null;
    timeEndHour: number | null;
    skillLevel: SkillPreference | null;
    budgetCents: number | null;
    radiusKm: number | null;
    intent: PostIntent;
    /** Approx center from city geocode when available. */
    searchCenter: GeoPoint | null;
  };
  events: {
    items: PostPlaceRecommendation[];
    method: RecommendationMethod;
    methodNote: string;
    emptyReason: string | null;
  };
  venues: {
    items: PostPlaceRecommendation[];
    method: "deterministic-place-filters";
    methodNote: string;
    emptyReason: string | null;
  };
  people: {
    items: PostPeopleRecommendation[];
    method: "deterministic-profile-overlap";
    methodNote: string;
    emptyReason: string | null;
  };
  integrations: {
    sklearnRecommenderConfigured: boolean;
    sklearnRecommenderUsed: boolean;
    geocodeUsed: boolean;
  };
};
