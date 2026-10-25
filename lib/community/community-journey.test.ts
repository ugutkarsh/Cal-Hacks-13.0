/**
 * Community experience journey — fixture / unit-integration tests.
 *
 * Mode: MOCKED (no live Supabase, Realtime, Apify, or sklearn HTTP).
 * Covers domain rules for the Task 9 end-to-end path using synthetic fixtures only.
 */

import { describe, expect, it, beforeEach } from "vitest";
import {
  applyExtractionConfirmation,
  runPostExtraction,
} from "@/lib/community/extract-validation";
import { parsePostCreate } from "@/lib/community/validation";
import { parseReplyCreate } from "@/lib/community/interaction-validation";
import {
  canViewerInteractWithPost,
  canViewerReadPost,
} from "@/lib/community/visibility";
import { recommendPeopleForPost } from "@/lib/community/recommend-people";
import { recommendVenuesForPost } from "@/lib/community/recommend-places";
import { recommendEventsForPost } from "@/lib/community/recommend-events";
import { communityPostToMatchQuery } from "@/lib/community/post-to-preferences";
import { excludeBlockedIds } from "@/lib/privacy/blocks";
import {
  checkRateLimit,
  resetRateLimitsForTests,
} from "@/lib/privacy/rate-limit";
import {
  parseReportCreate,
  reportsArePubliclyListable,
} from "@/lib/privacy/reports";
import {
  assertDiscoverableCoords,
  parseProfileUpdate,
} from "@/lib/profiles/validation";
import { mapOwnProfile, mapPublicProfile } from "@/lib/profiles/mappers";
import {
  dmPairKey,
  accessErrorStatus,
} from "@/lib/messaging/access";
import {
  mapChatMessage,
  peerIdFromPairKey,
} from "@/lib/messaging/mappers";
import {
  parseSendMessageBody,
  parseStartConversationBody,
} from "@/lib/messaging/validation";
import { resolveSelectionAfterFilter } from "@/lib/selection";
import type { DbProfile } from "@/types/database";
import type { PlaceEntity, EventEntity, MapEntity } from "@/types/map-entities";
import type { PeopleMatchCandidate } from "@/lib/community/recommend-people";

const AUTHOR = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PEER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const STRANGER = "cccccccc-cccc-cccc-cccc-cccccccccccc";

const NL_POST =
  "Hi, I'm new in San Francisco and looking to play badminton on Saturdays or Sundays between 5 and 9 PM. If anyone knows a place or needs another player, let me know.";

function authorProfile(partial: Partial<DbProfile> = {}): DbProfile {
  return {
    id: AUTHOR,
    display_name: "Alex",
    avatar_url: null,
    bio: "New to SF badminton",
    city: "San Francisco",
    neighborhood: "Mission",
    discoverable: true,
    discovery_lat: 37.76,
    discovery_lng: -122.42,
    location_share_level: "approximate",
    interests: ["badminton"],
    skill_level: "intermediate",
    availability_days: ["sat", "sun"],
    availability_start_hour: 17,
    availability_end_hour: 21,
    preferred_radius_km: 20,
    dm_policy: "discoverable_only",
    created_at: "2026-10-24T12:00:00.000Z",
    updated_at: "2026-10-24T12:00:00.000Z",
    ...partial,
  };
}

describe("community journey (MOCKED fixtures)", () => {
  beforeEach(() => {
    resetRateLimitsForTests();
  });

  it("1–2. new user profile: interests, location share, availability, discovery", () => {
    const parsed = parseProfileUpdate({
      displayName: "Alex",
      city: "San Francisco",
      neighborhood: "Mission",
      interests: ["badminton", "running"],
      skillLevel: "intermediate",
      availabilityDays: ["sat", "sun"],
      availabilityStartHour: 17,
      availabilityEndHour: 21,
      preferredRadiusKm: 20,
      discoverable: true,
      discoveryLat: 37.759123,
      discoveryLng: -122.419876,
      locationShareLevel: "approximate",
      dmPolicy: "discoverable_only",
      id: STRANGER, // forged — must be ignored
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).not.toHaveProperty("id");
    expect(parsed.value.interests).toContain("badminton");
    expect(parsed.value.discoveryLat).toBe(37.76);
    expect(parsed.value.discoveryLng).toBe(-122.42);

    const coordErr = assertDiscoverableCoords({
      discoverable: true,
      discoveryLat: parsed.value.discoveryLat ?? null,
      discoveryLng: parsed.value.discoveryLng ?? null,
      locationShareLevel: "approximate",
    });
    expect(coordErr).toBeNull();

    const own = mapOwnProfile(authorProfile());
    expect(own.dmPolicy).toBe("discoverable_only");
    expect(own.locationShareLevel).toBe("approximate");

    const pub = mapPublicProfile(authorProfile());
    expect(pub).not.toBeNull();
    expect(pub).not.toHaveProperty("dmPolicy");
    expect(JSON.stringify(pub)).not.toContain("dm_policy");
  });

  it("3–5. NL post → extract → confirm → visible to community, not private/archived", () => {
    const extraction = runPostExtraction(NL_POST, "America/Los_Angeles");
    expect(extraction.engine).toBe("deterministic-rules");
    expect(extraction.extracted.activity.value).toBe("badminton");
    expect(extraction.extracted.city.value).toBe("San Francisco");

    const confirmed = applyExtractionConfirmation({
      originalMessage: NL_POST,
      activity: extraction.suggestedDraft.activity,
      category: extraction.suggestedDraft.category,
      city: extraction.suggestedDraft.city,
      preferredDays: extraction.suggestedDraft.preferredDays,
      timeStartHour: extraction.suggestedDraft.timeStartHour,
      timeEndHour: extraction.suggestedDraft.timeEndHour,
      intent: "find_teammates",
    });
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;
    expect(confirmed.createBody.message).toBe(NL_POST);
    expect(confirmed.createBody.activity).toBe("badminton");
    expect(confirmed.createBody.preferredDays).toEqual(["sat", "sun"]);

    const create = parsePostCreate({
      ...confirmed.createBody,
      intent: "find_teammates",
      visibility: "public",
      ownerId: STRANGER, // forged
    });
    expect(create.ok).toBe(true);
    if (!create.ok) return;
    expect(create.value).not.toHaveProperty("ownerId");

    const openPublic = {
      ownerId: AUTHOR,
      visibility: "public" as const,
      status: "open" as const,
      authorDiscoverable: true,
    };
    expect(canViewerReadPost(openPublic, PEER)).toBe(true);
    expect(canViewerInteractWithPost(openPublic, PEER)).toBe(true);
    expect(
      canViewerReadPost({ ...openPublic, visibility: "private" }, PEER),
    ).toBe(false);
    expect(
      canViewerReadPost({ ...openPublic, status: "archived" }, PEER),
    ).toBe(false);
    expect(
      canViewerReadPost({ ...openPublic, status: "archived" }, AUTHOR),
    ).toBe(true);
  });

  it("6. peer can express interest + reply; rate limit eventually blocks abuse", () => {
    const reply = parseReplyCreate({ body: "I play Saturdays near Mission!" });
    expect(reply.ok).toBe(true);

    for (let i = 0; i < 20; i++) {
      expect(checkRateLimit("reply_create", PEER).ok).toBe(true);
    }
    expect(checkRateLimit("reply_create", PEER).ok).toBe(false);

    for (let i = 0; i < 30; i++) {
      expect(checkRateLimit("interest_toggle", PEER).ok).toBe(true);
    }
    expect(checkRateLimit("interest_toggle", PEER).ok).toBe(false);
  });

  it("7–8. explainable people/venue/event recs + map selection keeps recommended pin", async () => {
    const query = communityPostToMatchQuery(
      {
        id: "11111111-1111-1111-1111-111111111111",
        ownerId: AUTHOR,
        message: NL_POST,
        activity: "badminton",
        category: "sports",
        city: "San Francisco",
        neighborhood: "Mission",
        preferredDays: ["sat", "sun"],
        timeStartHour: 17,
        timeEndHour: 21,
        intent: "find_teammates",
        skillLevel: "intermediate",
        budgetCents: null,
        radiusKm: 20,
        visibility: "public",
        status: "open",
        createdAt: "2026-10-24T12:00:00.000Z",
        updatedAt: "2026-10-24T12:00:00.000Z",
        isOwner: true,
        author: null,
        interestCount: 0,
        replyCount: 0,
        viewerInterested: false,
      },
      { lat: 37.77, lng: -122.42 },
    );

    const people: PeopleMatchCandidate[] = [
      {
        id: PEER,
        displayName: "Blake",
        bio: "Looking for badminton partners",
        city: "San Francisco",
        neighborhood: "Mission",
        interests: ["badminton"],
        skillLevel: "intermediate",
        availabilityDays: ["sat", "sun"],
        availabilityStartHour: 16,
        availabilityEndHour: 21,
        preferredRadiusKm: 25,
        discoveryLat: 37.78,
        discoveryLng: -122.41,
        discoverable: true,
        acceptsMessages: true,
        activelyLooking: true,
        activelyLookingNote: "Open post about badminton",
        lookingActivity: "badminton",
      },
      {
        id: STRANGER,
        displayName: "Far Away",
        bio: "Hockey in Boston",
        city: "Boston",
        neighborhood: null,
        interests: ["hockey"],
        skillLevel: "advanced",
        availabilityDays: ["mon"],
        availabilityStartHour: 9,
        availabilityEndHour: 11,
        preferredRadiusKm: 10,
        discoveryLat: 42.36,
        discoveryLng: -71.06,
        discoverable: true,
        acceptsMessages: true,
        activelyLooking: false,
        activelyLookingNote: null,
        lookingActivity: null,
      },
    ];

    const peopleRecs = recommendPeopleForPost(people, query, {
      viewerId: AUTHOR,
      postOwnerId: AUTHOR,
    });
    expect(peopleRecs.items.length).toBeGreaterThan(0);
    expect(peopleRecs.items.every((p) => p.id !== STRANGER)).toBe(true);
    expect(peopleRecs.items[0]!.reasons.length).toBeGreaterThan(0);
    expect(peopleRecs.items[0]!.reasons[0]!.label.length).toBeGreaterThan(0);

    const venues: PlaceEntity[] = [
      {
        id: "place-court-1",
        kind: "place",
        name: "Mission Badminton Club",
        category: "sports",
        summary: "Indoor badminton courts",
        locationLabel: "Mission, San Francisco",
        coordinates: { lat: 37.76, lng: -122.42 },
        imageUrl: null,
        imageCredit: null,
        provenance: "supabase",
        createdAt: "2026-10-24T12:00:00.000Z",
        amenities: [],
        rating: null,
        reviewCount: 0,
      },
      {
        id: "place-far",
        kind: "place",
        name: "Boston Gym",
        category: "sports",
        summary: "Hockey rink",
        locationLabel: "Boston, MA",
        coordinates: { lat: 42.36, lng: -71.06 },
        imageUrl: null,
        imageCredit: null,
        provenance: "supabase",
        createdAt: "2026-10-24T12:00:00.000Z",
        amenities: [],
        rating: null,
        reviewCount: 0,
      },
    ];
    const venueRecs = recommendVenuesForPost(venues, query);
    expect(venueRecs.items.length).toBeGreaterThan(0);
    expect(venueRecs.items[0]!.id).toBe("place-court-1");
    expect(venueRecs.items[0]!.reasons.some((r) => r.label.length > 0)).toBe(
      true,
    );
    // Never claim bookable/open hours we do not verify.
    expect(JSON.stringify(venueRecs).toLowerCase()).not.toContain("bookable");

    const events: EventEntity[] = [
      {
        id: "event-1",
        kind: "event",
        name: "SF Badminton Open Play",
        category: "sports",
        summary: "Casual badminton meetup",
        locationLabel: "San Francisco",
        coordinates: { lat: 37.77, lng: -122.42 },
        imageUrl: null,
        imageCredit: null,
        provenance: "supabase",
        createdAt: "2026-10-24T12:00:00.000Z",
        startsAt: "2026-11-01T01:00:00.000Z",
        endsAt: "2026-11-01T03:00:00.000Z",
        organizerName: "Club",
        organizerId: "org-1",
        sourceUrl: "https://example.com/badminton",
        capacity: 20,
        attendeeCount: 4,
        attendeesPreview: [],
        reviews: [],
        isRegistrationOpen: true,
        difficultyLabel: "Open",
        costCents: null,
      },
    ];
    const eventRecs = await recommendEventsForPost(events, query);
    expect(eventRecs.items.length).toBeGreaterThan(0);
    expect(eventRecs.methodNote || eventRecs.method).toBeTruthy();

    const catalog: MapEntity[] = [...venues, ...events];
    const court = venues[0]!;
    const selected = resolveSelectionAfterFilter(court, catalog);
    expect(selected?.id).toBe("place-court-1");
  });

  it("9–10. authorized DM pair; stranger cannot resolve membership", () => {
    const start = parseStartConversationBody({
      peerId: PEER,
      senderId: STRANGER,
    });
    expect(start).toEqual({ ok: true, value: { peerId: PEER } });

    const key = dmPairKey(AUTHOR, PEER);
    expect(dmPairKey(PEER, AUTHOR)).toBe(key);
    expect(peerIdFromPairKey(key, AUTHOR)).toBe(PEER);
    expect(peerIdFromPairKey(key, STRANGER)).toBeNull();

    const send = parseSendMessageBody({
      body: "Want to play Saturday?",
      senderId: STRANGER,
    });
    expect(send.ok).toBe(true);

    const msg = mapChatMessage(
      {
        id: "11111111-1111-1111-1111-111111111111",
        conversation_id: "22222222-2222-2222-2222-222222222222",
        sender_id: AUTHOR,
        body: "Want to play Saturday?",
        created_at: "2026-10-24T12:00:00.000Z",
      },
      PEER,
    );
    expect(msg.isMine).toBe(false);
    expect(accessErrorStatus("not_member")).toBe(403);
  });

  it("11. blocking, reporting, visibility, ownership", () => {
    const people = [{ id: PEER }, { id: STRANGER }];
    expect(excludeBlockedIds(people, new Set([PEER])).map((p) => p.id)).toEqual(
      [STRANGER],
    );

    expect(reportsArePubliclyListable()).toBe(false);
    const report = parseReportCreate({
      targetType: "post",
      targetId: "11111111-1111-1111-1111-111111111111",
      reason: "spam",
      reporterId: STRANGER,
    });
    expect(report.ok).toBe(true);
    if (report.ok) expect(report.value).not.toHaveProperty("reporterId");

    // Hidden profile never public.
    expect(
      mapPublicProfile(
        authorProfile({
          location_share_level: "hidden",
          discoverable: true,
        }),
      ),
    ).toBeNull();

    // Undiscoverable never public.
    expect(
      mapPublicProfile(authorProfile({ discoverable: false })),
    ).toBeNull();

    // Ownership: only owner reads archived.
    expect(
      canViewerReadPost(
        {
          ownerId: AUTHOR,
          visibility: "public",
          status: "archived",
          authorDiscoverable: true,
        },
        PEER,
      ),
    ).toBe(false);
  });
});
