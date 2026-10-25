"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DiscoveryMap } from "@/components/map/discovery-map";
import { MapLegend } from "@/components/map/map-legend";
import {
  MapEmptyState,
  MapErrorState,
  MapLoadingState,
} from "@/components/map/map-states";
import { MeetupPlannerPanel } from "@/components/map/meetup-planner-panel";
import { NlSearchPanel } from "@/components/map/nl-search-panel";
import { DiscoveryOverlays } from "@/components/navigation/discovery-overlays";
import { DetailPostcard } from "@/components/postcards/detail-postcard";
import { PreviewPostcard } from "@/components/postcards/preview-postcard";
import { ForYouPanel } from "@/components/recommendations/for-you-panel";
import type { CompatibilityMatch } from "@/types/compatibility";
import type {
  MeetupPlan,
  MeetupPlanCriteria,
  MeetupPlanOption,
} from "@/types/meetup-plan";
import type {
  NlSearchCriteria,
  NlSearchMatch,
  NlSearchResponse,
} from "@/types/nl-search";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  DEFAULT_KINDS,
  loadMapEntities,
  type LoadState,
} from "@/lib/data/map-entities";
import {
  clearFeedbackEvents,
  loadFeedbackEvents,
  recordFeedbackEvent,
  replaceFeedbackEvents,
} from "@/lib/feedback/storage";
import { requestNearbyEventsRefresh } from "@/lib/ingest/auto-refresh-client";
import { requestBrowserLocation } from "@/lib/location/browser-geolocation";
import { createDefaultPreferences } from "@/lib/preferences/defaults";
import {
  loadPreferences,
  savePreferences,
} from "@/lib/preferences/storage";
import {
  filterVisibleMapEntities,
  relevanceTierFromScores,
} from "@/lib/map/discovery-visibility";
import { fetchRecommendationsFromApi } from "@/lib/recommendations/fetch-recommendations";
import {
  recommendActivities,
  recommendationById,
} from "@/lib/recommendations/rank";
import { resolveSelectionAfterFilter } from "@/lib/selection";
import type { FeedbackAction, FeedbackEvent } from "@/types/feedback";
import type {
  CategoryFilter,
  EntityKind,
  EventEntity,
  MapEntity,
} from "@/types/map-entities";
import type { UserPreferences } from "@/types/preferences";
import type { RecommendationResult } from "@/types/recommendations";

export function DiscoveryExperience() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [kinds, setKinds] = useState<EntityKind[]>(DEFAULT_KINDS);
  const [entities, setEntities] = useState<MapEntity[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [canUseDemoFallback, setCanUseDemoFallback] = useState(false);
  const [forceDemo, setForceDemo] = useState(false);
  const [dataSourceLabel, setDataSourceLabel] = useState("Loading…");
  const [dataMode, setDataMode] = useState<"demo" | "supabase" | null>(null);
  const [selected, setSelected] = useState<MapEntity | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  /** Card hover → emphasize matching map pin (UI only). */
  const [emphasizedId, setEmphasizedId] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [filtersActive, setFiltersActive] = useState(false);

  const [nlBusy, setNlBusy] = useState(false);
  const [nlError, setNlError] = useState<string | null>(null);
  const [nlResult, setNlResult] = useState<NlSearchResponse | null>(null);
  const [nlPanelOpen, setNlPanelOpen] = useState(false);
  /** When set, map shows only NL match ids (real catalog rows). */
  const [nlMatchIds, setNlMatchIds] = useState<Set<string> | null>(null);
  const [compatMatches, setCompatMatches] = useState<CompatibilityMatch[]>(
    [],
  );
  const [pendingMessagePeerId, setPendingMessagePeerId] = useState<
    string | null
  >(null);

  const [planBusy, setPlanBusy] = useState(false);
  const [planShareBusy, setPlanShareBusy] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planShareNote, setPlanShareNote] = useState<string | null>(null);
  const [meetupPlan, setMeetupPlan] = useState<MeetupPlan | null>(null);
  const [planPanelOpen, setPlanPanelOpen] = useState(false);
  const [planMessage, setPlanMessage] = useState("");
  const [pendingAuthOpen, setPendingAuthOpen] = useState(false);

  const [preferences, setPreferences] = useState<UserPreferences>(
    createDefaultPreferences,
  );
  const [profileLabel, setProfileLabel] = useState<string | null>(null);
  /** Auth user id for private prefs/feedback — search stays in React state only. */
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [forYouOnly, setForYouOnly] = useState(false);
  /** When false: no recommended pin tiers / For You ranking highlights (filters still work). */
  const [personalizationEnabled, setPersonalizationEnabled] = useState(true);
  const [feedback, setFeedback] = useState<FeedbackEvent[]>([]);
  const [feedbackNote, setFeedbackNote] = useState<string | null>(null);

  function applyPrivateOwner(ownerId: string | null) {
    const loaded = loadPreferences(ownerId);
    setPreferences(loaded.preferences);
    setFeedback(loadFeedbackEvents(ownerId));
  }

  useEffect(() => {
    applyPrivateOwner(null);
  }, []);

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    let mounted = true;

    function applySession(
      session: {
        user?: {
          id?: string;
          email?: string | null;
          user_metadata?: { display_name?: unknown };
        } | null;
      } | null,
      options?: { clearSearch?: boolean; reloadPrivate?: boolean },
    ) {
      if (!mounted) return;
      const uid = session?.user?.id ?? null;
      setSessionUserId(uid);
      if (options?.reloadPrivate) applyPrivateOwner(uid);
      // Search never leaves this device; clear only when the person changes.
      if (options?.clearSearch) setSearch("");
      const meta = session?.user?.user_metadata?.display_name;
      const email = session?.user?.email;
      setProfileLabel(
        typeof meta === "string" && meta.trim()
          ? meta.trim()
          : email
            ? email.split("@")[0]
            : null,
      );
    }

    void client.auth.getSession().then(({ data }) => {
      applySession(data.session, { reloadPrivate: true });
    });
    const { data: sub } = client.auth.onAuthStateChange((event, session) => {
      const identityChanged =
        event === "SIGNED_IN" ||
        event === "SIGNED_OUT" ||
        event === "USER_UPDATED";
      applySession(session, {
        clearSearch: identityChanged,
        reloadPrivate: identityChanged,
      });
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Pull signed-in feedback from Supabase (own rows only) when identity is known.
  useEffect(() => {
    if (!sessionUserId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/feedback", { credentials: "include" });
        const json = (await res.json()) as {
          ok?: boolean;
          events?: FeedbackEvent[];
        };
        if (cancelled) return;
        if (res.ok && json.ok && Array.isArray(json.events)) {
          replaceFeedbackEvents(json.events, sessionUserId);
          setFeedback(json.events);
        }
      } catch {
        // Local cache already loaded via applyPrivateOwner.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionUserId]);

  async function refreshNearbyFor(
    prefs: UserPreferences,
    options?: { force?: boolean },
  ) {
    const point = prefs.startingPoint;
    if (!point) return;

    const refresh = await requestNearbyEventsRefresh({
      lat: point.lat,
      lng: point.lng,
      locationLabel: prefs.startingPointLabel,
      force: options?.force === true,
    });

    if (refresh.ran) {
      setReloadToken((t) => t + 1);
    }
  }

  // Browser location on open — only if user hasn't pinned a manual city.
  // Manual/demo prefs keep their place and still get a nearby Apify refresh.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const saved = loadPreferences(sessionUserId).preferences;

      if (saved.locationSource === "manual") {
        // Keep full nearby map visible (For You is opt-in — it only ranks ~20).
        await refreshNearbyFor(saved, { force: false });
        return;
      }

      const loc = await requestBrowserLocation();
      if (cancelled) return;

      if (!loc.ok) {
        if (saved.startingPoint) {
          await refreshNearbyFor(saved, { force: false });
        }
        return;
      }

      const next: UserPreferences = {
        ...saved,
        startingPoint: loc.point,
        startingPointLabel: loc.label,
        locationSource: "browser",
      };
      setPreferences(next);
      savePreferences(next, sessionUserId);
      if (cancelled) return;
      await refreshNearbyFor(next, { force: false });
    })();

    return () => {
      cancelled = true;
    };
    // Re-run when the signed-in person changes so location stays private to them.
  }, [sessionUserId]);

  useEffect(() => {
    setFiltersActive(
      search.trim().length > 0 ||
        category !== "all" ||
        kinds.length !== DEFAULT_KINDS.length ||
        forYouOnly,
    );
  }, [search, category, kinds, forYouOnly]);

  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");
    setErrorMessage(null);
    setCanUseDemoFallback(false);

    void (async () => {
      const result = await loadMapEntities(
        { search, category, kinds },
        { forceDemo },
      );
      if (cancelled) return;

      setDataMode(result.meta.mode);
      setDataSourceLabel(result.meta.label);

      if (result.error) {
        setEntities([]);
        setLoadState("error");
        setErrorMessage(result.error);
        setCanUseDemoFallback(result.canUseDemoFallback);
        return;
      }

      setEntities(result.entities);
      setLoadState(result.entities.length === 0 ? "empty" : "success");
    })();

    return () => {
      cancelled = true;
    };
  }, [search, category, kinds, reloadToken, forceDemo]);

  const events = useMemo(
    () => entities.filter((e): e is EventEntity => e.kind === "event"),
    [entities],
  );

  /** Instant local rules while the sklearn service responds. */
  const rulesFallback = useMemo(
    () =>
      recommendActivities(
        events,
        preferences,
        personalizationEnabled ? feedback : [],
        { searchIntent: search },
      ),
    [events, preferences, feedback, personalizationEnabled, search],
  );

  const [recommendationResult, setRecommendationResult] =
    useState<RecommendationResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Optimistic rules until /api/recommendations returns.
    setRecommendationResult(rulesFallback);

    if (events.length === 0) return;

    void (async () => {
      try {
        const ml = await fetchRecommendationsFromApi({
          preferences,
          events,
          feedback: personalizationEnabled ? feedback : [],
          limit: 20,
        });
        if (cancelled || !ml) return;
        // Soft search-intent re-rank on the client so API ML results stay filter-aware.
        if (search.trim()) {
          const reranked = recommendActivities(
            ml.ranked.map((r) => r.activity),
            preferences,
            personalizationEnabled ? feedback : [],
            { searchIntent: search },
          );
          setRecommendationResult({
            ...ml,
            ranked: reranked.ranked,
            methodNote: `${ml.methodNote} Search intent applied as a soft boost (filters stay authoritative).`,
          });
        } else {
          setRecommendationResult(ml);
        }
      } catch {
        if (cancelled) return;
        setRecommendationResult({
          ...rulesFallback,
          method: "rules-fallback",
          methodNote:
            "Matched to your interests, schedule, budget, and distance — with soft feedback rules when available.",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [events, preferences, feedback, rulesFallback, personalizationEnabled, search]);

  const activeRecommendations = recommendationResult ?? rulesFallback;

  const recommendedIds = useMemo(() => {
    if (!personalizationEnabled) return new Set<string>();
    return new Set(activeRecommendations.ranked.map((r) => r.activity.id));
  }, [activeRecommendations, personalizationEnabled]);

  const relevanceById = useMemo(
    () =>
      relevanceTierFromScores(
        activeRecommendations.ranked.map((r) => ({
          activityId: r.activity.id,
          score: r.score,
        })),
        personalizationEnabled,
      ),
    [activeRecommendations, personalizationEnabled],
  );

  const visibleEntities = useMemo(
    () =>
      filterVisibleMapEntities({
        entities,
        startingPoint: preferences.startingPoint,
        maxDistanceKm: preferences.maxDistanceKm,
        searchActive: search.trim().length > 0,
        nlMatchIds,
        forYouOnly: forYouOnly && personalizationEnabled,
        recommendedIds,
      }),
    [
      entities,
      forYouOnly,
      personalizationEnabled,
      recommendedIds,
      preferences.startingPoint,
      preferences.maxDistanceKm,
      nlMatchIds,
      search,
    ],
  );

  useEffect(() => {
    const next = resolveSelectionAfterFilter(selected, visibleEntities);
    if (next !== selected) {
      setSelected(next);
      if (!next) setDetailOpen(false);
    }
  }, [visibleEntities, selected]);

  function resetFilters() {
    setSearch("");
    setCategory("all");
    setKinds(DEFAULT_KINDS);
    setForYouOnly(false);
    setNlMatchIds(null);
    setNlResult(null);
    setNlPanelOpen(false);
    setMeetupPlan(null);
    setPlanPanelOpen(false);
  }

  function resetPersonalizationView() {
    setPersonalizationEnabled(true);
    setForYouOnly(false);
    setFeedbackNote(
      "Personalization display reset — rankings use prefs + your feedback again. Clear saved feedback in Preferences if you want a cold start.",
    );
  }

  const handleSelect = useCallback((entity: MapEntity) => {
    setSelected(entity);
    setEmphasizedId(null);
    setDetailOpen(false);
  }, []);

  const handleSuggestionApply = useCallback(
    (suggestion: {
      search?: string;
      category?: CategoryFilter;
      kinds?: EntityKind[];
    }) => {
      if (suggestion.category != null) setCategory(suggestion.category);
      if (suggestion.kinds != null && suggestion.kinds.length > 0) {
        setKinds(suggestion.kinds);
      }
      if (suggestion.search != null) setSearch(suggestion.search);
    },
    [],
  );

  const runNlRequest = useCallback(
    async (payload: {
      message: string;
      criteria?: NlSearchCriteria;
      confirm?: boolean;
    }) => {
      setNlBusy(true);
      setNlError(null);
      try {
        const res = await fetch("/api/nl-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: payload.message,
            criteria: payload.criteria,
            confirm: payload.confirm === true,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            searchCenter: preferences.startingPoint,
            forceDemo: forceDemo || dataMode === "demo",
          }),
        });
        const json = (await res.json()) as
          | NlSearchResponse
          | { ok: false; error: string };
        if (!json.ok) {
          setNlError(json.error || "NL search failed");
          return;
        }
        setNlResult(json);
        setNlPanelOpen(true);
        if (json.searched) {
          setNlMatchIds(new Set(json.matches.map((m) => m.id)));
          setKinds(json.criteria.kinds);
          if (json.criteria.category) {
            setCategory(json.criteria.category);
          }
          if (json.matches[0]) {
            const entity = entities.find((e) => e.id === json.matches[0].id);
            if (entity) handleSelect(entity);
          }
        }
      } catch {
        setNlError("Could not reach NL search. Try again.");
      } finally {
        setNlBusy(false);
      }
    },
    [
      preferences.startingPoint,
      forceDemo,
      dataMode,
      entities,
      handleSelect,
    ],
  );

  const handleNlMatch = useCallback(
    (message: string) => {
      void runNlRequest({ message });
    },
    [runNlRequest],
  );

  const handleNlConfirm = useCallback(
    (criteria: NlSearchCriteria) => {
      void runNlRequest({
        message: nlResult?.originalMessage || search,
        criteria,
        confirm: true,
      });
    },
    [runNlRequest, nlResult?.originalMessage, search],
  );

  const handleNlSelectMatch = useCallback(
    (match: NlSearchMatch) => {
      const entity = entities.find((e) => e.id === match.id);
      if (entity) {
        handleSelect(entity);
        setDetailOpen(false);
      }
    },
    [entities, handleSelect],
  );

  const runMeetupPlan = useCallback(
    async (payload: {
      message: string;
      criteria?: MeetupPlanCriteria;
      confirm?: boolean;
    }) => {
      setPlanBusy(true);
      setPlanError(null);
      setPlanShareNote(null);
      try {
        const res = await fetch("/api/meetup-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: payload.message,
            criteria: payload.criteria,
            confirm: payload.confirm === true,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            searchCenter: preferences.startingPoint,
            forceDemo: forceDemo || dataMode === "demo",
          }),
        });
        const json = (await res.json()) as
          | { ok: true; plan: MeetupPlan }
          | { ok: false; error: string };
        if (!json.ok) {
          setPlanError(json.error || "Planner failed");
          return;
        }
        setMeetupPlan(json.plan);
        setPlanPanelOpen(true);
        setPlanMessage(payload.message);
        if (json.plan.status === "suggested" && json.plan.options[0]) {
          const first = json.plan.options[0];
          setNlMatchIds(new Set(json.plan.options.map((o) => o.id)));
          setKinds((prev) => {
            const next = new Set(prev);
            for (const o of json.plan.options) next.add(o.mapKind);
            return [...next];
          });
          const entity = entities.find((e) => e.id === first.id);
          if (entity) handleSelect(entity);
        }
      } catch {
        setPlanError("Could not reach meetup planner");
      } finally {
        setPlanBusy(false);
      }
    },
    [
      preferences.startingPoint,
      forceDemo,
      dataMode,
      entities,
      handleSelect,
    ],
  );

  const handlePlanMeetup = useCallback(
    (message: string) => {
      void runMeetupPlan({ message });
    },
    [runMeetupPlan],
  );

  const handlePlanSelectOption = useCallback(
    (option: MeetupPlanOption) => {
      setMeetupPlan((prev) =>
        prev
          ? {
              ...prev,
              selectedOptionId: option.id,
              draftShareMessage: prev.draftShareMessage,
            }
          : prev,
      );
      const entity = entities.find((e) => e.id === option.id);
      if (entity) {
        handleSelect(entity);
        setDetailOpen(false);
      }
    },
    [entities, handleSelect],
  );

  const handlePlanShare = useCallback(
    async (message: string) => {
      if (!meetupPlan) return;
      setPlanShareBusy(true);
      setPlanShareNote(null);
      try {
        const selected =
          meetupPlan.options.find((o) => o.id === meetupPlan.selectedOptionId) ??
          meetupPlan.options[0];
        const res = await fetch("/api/meetup-plan/share", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            confirm: true,
            criteria: meetupPlan.criteria,
            optionName: selected?.name ?? null,
            message,
          }),
        });
        const json = (await res.json()) as
          | { ok: true; message: string; postId: string }
          | { ok: false; error: string };
        if (res.status === 401) {
          setPendingAuthOpen(true);
          setPlanShareNote("Sign in required to share a plan as a post.");
          return;
        }
        if (!json.ok) {
          setPlanShareNote(json.error || "Share failed");
          return;
        }
        setPlanShareNote(json.message);
      } catch {
        setPlanShareNote("Could not share plan");
      } finally {
        setPlanShareBusy(false);
      }
    },
    [meetupPlan],
  );

  async function syncFeedbackFromServer(userId: string) {
    try {
      const res = await fetch("/api/feedback", { credentials: "include" });
      const json = (await res.json()) as {
        ok?: boolean;
        events?: FeedbackEvent[];
      };
      if (res.ok && json.ok && Array.isArray(json.events)) {
        replaceFeedbackEvents(json.events, userId);
        setFeedback(json.events);
        return;
      }
    } catch {
      // Keep local cache on network failure.
    }
    setFeedback(loadFeedbackEvents(userId));
  }

  function handleFeedback(
    action: FeedbackAction,
    rating?: number,
    activityId?: string,
    activityCategory?: string | null,
  ) {
    const id =
      activityId ??
      (selected?.kind === "event" ? selected.id : null);
    if (!id) return;
    const category =
      activityCategory ??
      (selected?.kind === "event" ? selected.category : null);

    const event = recordFeedbackEvent(
      {
        activityId: id,
        action,
        rating,
        activityCategory: category,
      },
      sessionUserId,
    );
    setFeedback(loadFeedbackEvents(sessionUserId));

    const actionLabel =
      action === "skip"
        ? "Dismissed"
        : action === "like"
          ? "Liked"
          : action === "save"
            ? "Saved"
            : "Recorded";
    setFeedbackNote(
      `${actionLabel} privately (${event.storage}) — soft ranking tweak only; hard prefs still win.`,
    );

    if (sessionUserId) {
      void (async () => {
        try {
          const res = await fetch("/api/feedback", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              activityId: id,
              action,
              rating: action === "rate" ? (rating ?? 5) : null,
              activityCategory: category,
            }),
          });
          if (res.ok) {
            await syncFeedbackFromServer(sessionUserId);
            setFeedbackNote(
              `${actionLabel} privately (synced) — rules personalization, not a trained model.`,
            );
          }
        } catch {
          // Local record already applied.
        }
      })();
    }
  }

  async function handleClearPersonalization() {
    clearFeedbackEvents(sessionUserId);
    setFeedback([]);
    if (sessionUserId) {
      try {
        await fetch("/api/feedback", {
          method: "DELETE",
          credentials: "include",
        });
      } catch {
        // Local clear already applied.
      }
    }
    setFeedbackNote(
      "Personalization cleared — For You uses your baseline preferences only.",
    );
  }

  const selectedRecommendation =
    selected?.kind === "event"
      ? recommendationById(activeRecommendations, selected.id)
      : undefined;

  const showLoading = loadState === "loading";

  const handlePreferencesSaved = useCallback(
    (next: UserPreferences) => {
      const prev = preferences.startingPoint;
      setPreferences(next);
      savePreferences(next, sessionUserId);

      const nextPoint = next.startingPoint;
      const moved =
        !prev ||
        !nextPoint ||
        Math.abs(prev.lat - nextPoint.lat) > 0.05 ||
        Math.abs(prev.lng - nextPoint.lng) > 0.05 ||
        preferences.startingPointLabel !== next.startingPointLabel;

      if (moved && nextPoint) {
        void refreshNearbyFor(next, { force: true });
      }
    },
    // refreshNearbyFor closes over prefs; force refresh uses the saved `next`.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional stable prefs snapshot
    [preferences.startingPoint, preferences.startingPointLabel, sessionUserId],
  );

  const handleLocationApplied = useCallback(
    (next: UserPreferences) => {
      setPreferences(next);
      savePreferences(next, sessionUserId);
      void refreshNearbyFor(next, { force: true });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionUserId],
  );

  const handleOpenMapEntity = useCallback(
    (entityId: string, kind: EntityKind) => {
      setKinds((prev) => (prev.includes(kind) ? prev : [...prev, kind]));
      const entity = entities.find((e) => e.id === entityId);
      if (entity) {
        handleSelect(entity);
        setDetailOpen(false);
      }
    },
    [entities, handleSelect],
  );

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[var(--brand-mist)]">
      <DiscoveryOverlays
        search={search}
        category={category}
        kinds={kinds}
        dataSourceLabel={dataSourceLabel}
        forYouOnly={forYouOnly}
        visibleCount={visibleEntities.length}
        loadedCount={entities.length}
        searching={loadState === "loading"}
        emptyResults={loadState === "empty" || (loadState === "success" && visibleEntities.length === 0)}
        profileLabel={profileLabel}
        sessionUserId={sessionUserId}
        preferences={preferences}
        onSearchChange={setSearch}
        onCategoryChange={setCategory}
        onKindsChange={setKinds}
        onSuggestionApply={handleSuggestionApply}
        onNlMatch={handleNlMatch}
        nlBusy={nlBusy}
        onPlanMeetup={handlePlanMeetup}
        planBusy={planBusy}
        onForYouOnlyChange={setForYouOnly}
        personalizationEnabled={personalizationEnabled}
        onPersonalizationEnabledChange={setPersonalizationEnabled}
        onResetPersonalizationView={resetPersonalizationView}
        onPreferencesSaved={handlePreferencesSaved}
        onLocationApplied={handleLocationApplied}
        onClearPersonalization={() => void handleClearPersonalization()}
        personalizationCount={feedback.length}
        onSignedOut={() => {
          setProfileLabel(null);
          setSessionUserId(null);
          setSearch("");
          applyPrivateOwner(null);
          router.push("/");
        }}
        onAuthenticated={() => setReloadToken((t) => t + 1)}
        onOpenMapEntity={handleOpenMapEntity}
        selectedPersonId={
          selected?.kind === "person" ? selected.id : null
        }
        onSelectPersonId={(id) => {
          setKinds((prev) =>
            prev.includes("person") ? prev : [...prev, "person"],
          );
          const entity = entities.find((e) => e.id === id);
          if (entity) {
            handleSelect(entity);
            setDetailOpen(false);
          }
        }}
        onCompatibilityMatches={setCompatMatches}
        pendingMessagePeerId={pendingMessagePeerId}
        onPendingMessagePeerConsumed={() => setPendingMessagePeerId(null)}
        pendingAuthOpen={pendingAuthOpen}
        onPendingAuthOpenConsumed={() => setPendingAuthOpen(false)}
      />

      <DiscoveryMap
        entities={visibleEntities}
        selectedId={selected?.id ?? null}
        emphasizedId={emphasizedId}
        recommendedIds={recommendedIds}
        relevanceById={relevanceById}
        onSelect={handleSelect}
        userCenter={preferences.startingPoint}
      />

      <MapLegend />

      <NlSearchPanel
        open={nlPanelOpen && !planPanelOpen}
        busy={nlBusy}
        error={nlError}
        result={nlResult}
        onClose={() => setNlPanelOpen(false)}
        onConfirmSearch={handleNlConfirm}
        onSelectMatch={handleNlSelectMatch}
        onClearMatches={() => {
          setNlMatchIds(null);
          setNlResult((prev) =>
            prev
              ? {
                  ...prev,
                  matches: [],
                  searched: false,
                  emptyReason: null,
                  dataSourceLabel: "Highlight cleared — keyword filters still apply",
                }
              : prev,
          );
        }}
      />

      <MeetupPlannerPanel
        open={planPanelOpen}
        busy={planBusy}
        shareBusy={planShareBusy}
        error={planError}
        shareNote={planShareNote}
        plan={meetupPlan}
        signedIn={Boolean(sessionUserId)}
        onClose={() => setPlanPanelOpen(false)}
        onUpdateCriteria={(criteria) =>
          setMeetupPlan((prev) => (prev ? { ...prev, criteria } : prev))
        }
        onBuildPlan={() => {
          if (!meetupPlan) return;
          void runMeetupPlan({
            message: planMessage || search,
            criteria: meetupPlan.criteria,
            confirm: true,
          });
        }}
        onSelectOption={handlePlanSelectOption}
        onShare={(message) => void handlePlanShare(message)}
        onRequestSignIn={() => setPendingAuthOpen(true)}
      />

      <ForYouPanel
        result={activeRecommendations}
        selectedId={selected?.id ?? null}
        personalized={personalizationEnabled}
        feedbackCount={feedback.length}
        onSelectActivityId={(id) => {
          const entity = entities.find((e) => e.id === id);
          if (entity) handleSelect(entity);
        }}
        onFeedback={
          personalizationEnabled
            ? (activityId, action, category) =>
                handleFeedback(action, undefined, activityId, category)
            : undefined
        }
      />

      {feedbackNote && (
        <p
          className="pointer-events-none absolute bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-[11px] text-white"
          role="status"
        >
          {feedbackNote}
        </p>
      )}

      {showLoading && <MapLoadingState />}

      {!showLoading &&
        loadState === "success" &&
        visibleEntities.length === 0 &&
        entities.length > 0 && (
          <MapEmptyState
            onReset={() => {
              void refreshNearbyFor(preferences, { force: true });
            }}
            title={`Nothing near ${preferences.startingPointLabel ?? "this location"} yet`}
            description="Far-away pins are hidden. Save a city in Preferences to fetch events for that place (takes 1–3 minutes)."
            actionLabel="Fetch nearby again"
          />
        )}

      {!showLoading && loadState === "empty" && (
        <MapEmptyState
          onReset={
            filtersActive ? resetFilters : () => setReloadToken((t) => t + 1)
          }
          title={
            filtersActive
              ? "Nothing on the map"
              : dataMode === "supabase"
                ? "No public records yet"
                : "Nothing on the map"
          }
          description={
            filtersActive
              ? "No places, events, or people match your search and filters."
              : dataMode === "supabase"
                ? "Supabase returned zero places, activities, and discoverable profiles. Seed data in the Dashboard or switch to demo mode via NEXT_PUBLIC_DATA_SOURCE=demo."
                : "No places, events, or people match your search and filters."
          }
          actionLabel={filtersActive ? "Clear filters" : "Refresh"}
        />
      )}

      {!showLoading && loadState === "error" && (
        <MapErrorState
          message={errorMessage ?? "Unknown error"}
          onRetry={() => {
            setForceDemo(false);
            setReloadToken((t) => t + 1);
          }}
          onUseDemo={
            canUseDemoFallback
              ? () => {
                  setForceDemo(true);
                  setReloadToken((t) => t + 1);
                }
              : undefined
          }
        />
      )}

      {selected && !detailOpen && (
        <div
          key={selected.id}
          className="pointer-events-auto absolute bottom-4 left-1/2 z-40 w-[calc(100%-1.5rem)] max-w-sm -translate-x-1/2 sm:bottom-6 sm:left-auto sm:right-4 sm:translate-x-0 md:right-[300px]"
        >
          <PreviewPostcard
            entity={selected}
            recommendationReasons={
              selectedRecommendation && !selectedRecommendation.excluded
                ? selectedRecommendation.reasons
                : []
            }
            onOpenDetail={() => setDetailOpen(true)}
            onClose={() => {
              setEmphasizedId(null);
              setSelected(null);
            }}
            onHoverChange={(hovered) =>
              setEmphasizedId(hovered ? selected.id : null)
            }
          />
        </div>
      )}

      {selected && detailOpen && (
        <DetailPostcard
          entity={selected}
          recommendationReasons={
            selectedRecommendation && !selectedRecommendation.excluded
              ? selectedRecommendation.reasons
              : []
          }
          personCompatibility={
            selected.kind === "person"
              ? (compatMatches.find((m) => m.id === selected.id) ?? null)
              : null
          }
          onClose={() => setDetailOpen(false)}
          onFeedback={
            selected.kind === "event" ? handleFeedback : undefined
          }
          onMessagePerson={(peerId) => setPendingMessagePeerId(peerId)}
          storageOwnerId={sessionUserId}
        />
      )}
    </div>
  );
}
