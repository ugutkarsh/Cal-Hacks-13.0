"use client";

/**
 * Owns panel open state so toggling nav icons does not re-render the map tree.
 */

import { useEffect, useState } from "react";
import { DiscoveryNav } from "@/components/navigation/discovery-nav";
import { PreferencesPanel } from "@/components/preferences/preferences-panel";
import { CommunityPanel } from "@/components/community/community-panel";
import { MessagesPanel } from "@/components/messages/messages-panel";
import { AuthPanel } from "@/components/profile/auth-panel";
import { ProfilePanel } from "@/components/profile/profile-panel";
import { TeammatesPanel } from "@/components/recommendations/teammates-panel";
import type { DiscoverySuggestion } from "@/components/ui/prompt-chips";
import type { CategoryFilter, EntityKind } from "@/types/map-entities";
import type { UserPreferences } from "@/types/preferences";

type DiscoveryOverlaysProps = {
  search: string;
  category: CategoryFilter;
  kinds: EntityKind[];
  dataSourceLabel: string;
  forYouOnly: boolean;
  visibleCount: number;
  loadedCount: number;
  searching?: boolean;
  emptyResults?: boolean;
  profileLabel: string | null;
  sessionUserId: string | null;
  preferences: UserPreferences;
  onSearchChange: (value: string) => void;
  onCategoryChange: (value: CategoryFilter) => void;
  onKindsChange: (kinds: EntityKind[]) => void;
  onSuggestionApply: (suggestion: DiscoverySuggestion) => void;
  onNlMatch: (message: string) => void;
  nlBusy?: boolean;
  onPlanMeetup: (message: string) => void;
  planBusy?: boolean;
  onForYouOnlyChange: (value: boolean) => void;
  personalizationEnabled?: boolean;
  onPersonalizationEnabledChange?: (value: boolean) => void;
  onResetPersonalizationView?: () => void;
  onPreferencesSaved: (next: UserPreferences) => void;
  onLocationApplied: (next: UserPreferences) => void;
  onClearPersonalization?: () => void;
  personalizationCount?: number;
  onSignedOut: () => void;
  onAuthenticated: () => void;
  onOpenMapEntity: (entityId: string, kind: EntityKind) => void;
  /** Focus a discoverable person pin from compatibility ranking. */
  selectedPersonId?: string | null;
  onSelectPersonId?: (id: string) => void;
  onCompatibilityMatches?: (
    matches: import("@/types/compatibility").CompatibilityMatch[],
  ) => void;
  /** Open DM when set from map person detail. */
  pendingMessagePeerId?: string | null;
  onPendingMessagePeerConsumed?: () => void;
  pendingAuthOpen?: boolean;
  onPendingAuthOpenConsumed?: () => void;
};

export function DiscoveryOverlays({
  search,
  category,
  kinds,
  dataSourceLabel,
  forYouOnly,
  visibleCount,
  loadedCount,
  searching = false,
  emptyResults = false,
  profileLabel,
  sessionUserId,
  preferences,
  onSearchChange,
  onCategoryChange,
  onKindsChange,
  onSuggestionApply,
  onNlMatch,
  nlBusy = false,
  onPlanMeetup,
  planBusy = false,
  onForYouOnlyChange,
  personalizationEnabled = true,
  onPersonalizationEnabledChange,
  onResetPersonalizationView,
  onPreferencesSaved,
  onLocationApplied,
  onClearPersonalization,
  personalizationCount = 0,
  onSignedOut,
  onAuthenticated,
  onOpenMapEntity,
  selectedPersonId = null,
  onSelectPersonId,
  onCompatibilityMatches,
  pendingMessagePeerId = null,
  onPendingMessagePeerConsumed,
  pendingAuthOpen = false,
  onPendingAuthOpenConsumed,
}: DiscoveryOverlaysProps) {
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [prefsDraft, setPrefsDraft] = useState(preferences);
  const [profileOpen, setProfileOpen] = useState(false);
  const [communityOpen, setCommunityOpen] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [messagePeerId, setMessagePeerId] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);

  useEffect(() => {
    if (!pendingMessagePeerId) return;
    setMessagePeerId(pendingMessagePeerId);
    setMessagesOpen(true);
    onPendingMessagePeerConsumed?.();
  }, [pendingMessagePeerId, onPendingMessagePeerConsumed]);

  useEffect(() => {
    if (!pendingAuthOpen) return;
    setAuthOpen(true);
    onPendingAuthOpenConsumed?.();
  }, [pendingAuthOpen, onPendingAuthOpenConsumed]);

  return (
    <>
      <DiscoveryNav
        search={search}
        category={category}
        kinds={kinds}
        dataSourceLabel={dataSourceLabel}
        forYouOnly={forYouOnly}
        visibleCount={visibleCount}
        loadedCount={loadedCount}
        searching={searching}
        emptyResults={emptyResults}
        profileLabel={profileLabel}
        onSearchChange={onSearchChange}
        onCategoryChange={onCategoryChange}
        onKindsChange={onKindsChange}
        onSuggestionApply={onSuggestionApply}
        onNlMatch={onNlMatch}
        nlBusy={nlBusy}
        onPlanMeetup={onPlanMeetup}
        planBusy={planBusy}
        onOpenPreferences={() => {
          setPrefsDraft(preferences);
          setPrefsOpen(true);
        }}
        onOpenProfile={() => setProfileOpen(true)}
        onOpenCommunity={() => setCommunityOpen(true)}
        onOpenMessages={() => {
          setMessagePeerId(null);
          setMessagesOpen(true);
        }}
        onForYouOnlyChange={onForYouOnlyChange}
        personalizationEnabled={personalizationEnabled}
        onPersonalizationEnabledChange={onPersonalizationEnabledChange}
        onResetPersonalizationView={onResetPersonalizationView}
      />

      <PreferencesPanel
        open={prefsOpen}
        preferences={prefsDraft}
        onChange={setPrefsDraft}
        onClose={() => setPrefsOpen(false)}
        onLocationApplied={(next) => {
          setPrefsDraft(next);
          setPrefsOpen(false);
          onLocationApplied(next);
        }}
        onSave={() => {
          setPrefsOpen(false);
          onPreferencesSaved(prefsDraft);
        }}
        onClearPersonalization={onClearPersonalization}
        personalizationCount={personalizationCount}
      />

      <ProfilePanel
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        onRequestSignIn={() => {
          setProfileOpen(false);
          setAuthOpen(true);
        }}
        onSignedOut={onSignedOut}
      />

      <MessagesPanel
        open={messagesOpen}
        signedIn={Boolean(sessionUserId)}
        viewerId={sessionUserId}
        startWithPeerId={messagePeerId}
        onClose={() => {
          setMessagesOpen(false);
          setMessagePeerId(null);
        }}
        onRequestSignIn={() => {
          setMessagesOpen(false);
          setAuthOpen(true);
        }}
        onConsumedStartPeer={() => setMessagePeerId(null)}
      />

      <CommunityPanel
        open={communityOpen}
        signedIn={Boolean(sessionUserId)}
        onClose={() => setCommunityOpen(false)}
        onRequestSignIn={() => {
          setCommunityOpen(false);
          setAuthOpen(true);
        }}
        onMessageUser={(peerId) => {
          setCommunityOpen(false);
          setMessagePeerId(peerId);
          setMessagesOpen(true);
        }}
        onOpenMapEntity={(entityId, kind) => {
          setCommunityOpen(false);
          onOpenMapEntity(entityId, kind);
        }}
      />

      <AuthPanel
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onAuthenticated={() => {
          setAuthOpen(false);
          setCommunityOpen(false);
          setProfileOpen(true);
          onAuthenticated();
        }}
      />

      <div className="pointer-events-none absolute right-3 top-24 z-30 md:top-28">
        <div className="pointer-events-auto">
          <TeammatesPanel
            sessionUserId={sessionUserId}
            selectedId={selectedPersonId}
            onSelectPersonId={(id) => onSelectPersonId?.(id)}
            onMessageUser={(peerId) => {
              setMessagePeerId(peerId);
              setMessagesOpen(true);
            }}
            onRequestSignIn={() => setAuthOpen(true)}
            onMatchesLoaded={onCompatibilityMatches}
          />
        </div>
      </div>
    </>
  );
}
