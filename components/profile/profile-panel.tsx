"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CATEGORY_OPTIONS } from "@/lib/data/map-entities";
import { geocodePlaceName } from "@/lib/location/geocode-place";
import { cn } from "@/lib/utils";
import type { DayOfWeek, SkillPreference } from "@/types/preferences";
import type {
  DmPolicy,
  LocationShareLevel,
  OwnProfile,
} from "@/types/profile";

const DAYS: { id: DayOfWeek; label: string }[] = [
  { id: "mon", label: "Mon" },
  { id: "tue", label: "Tue" },
  { id: "wed", label: "Wed" },
  { id: "thu", label: "Thu" },
  { id: "fri", label: "Fri" },
  { id: "sat", label: "Sat" },
  { id: "sun", label: "Sun" },
];

const SKILLS: { id: SkillPreference; label: string }[] = [
  { id: "any", label: "Any" },
  { id: "beginner", label: "Beginner" },
  { id: "intermediate", label: "Intermediate" },
  { id: "advanced", label: "Advanced" },
];

const DM_OPTIONS: { id: DmPolicy; label: string }[] = [
  { id: "everyone", label: "Anyone on Trailmap" },
  { id: "discoverable_only", label: "Only when I'm discoverable" },
  { id: "nobody", label: "Nobody (hide DMs)" },
];

const LOCATION_SHARE_OPTIONS: { id: LocationShareLevel; label: string }[] = [
  {
    id: "approximate",
    label: "Approximate map pin (~1 km) + city",
  },
  { id: "city_only", label: "City / neighborhood labels only (no pin)" },
  { id: "hidden", label: "Hide place hints (also turns off discovery)" },
];

const EXTRA_INTERESTS = ["badminton", "photography", "pickleball", "yoga"];

interface ProfilePanelProps {
  open: boolean;
  onClose: () => void;
  onRequestSignIn: () => void;
  onSignedOut: () => void;
}

export function ProfilePanel({
  open,
  onClose,
  onRequestSignIn,
  onSignedOut,
}: ProfilePanelProps) {
  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [loadState, setLoadState] = useState<
    "idle" | "loading" | "ready" | "unauthorized" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadState("loading");
    setError(null);
    setSaveNote(null);
    // Paint the panel first, then fetch profile.
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch("/api/profile", { credentials: "include" });
          const json = (await res.json()) as {
            ok?: boolean;
            error?: string;
            profile?: OwnProfile;
          };
          if (cancelled) return;
          if (res.status === 401) {
            setProfile(null);
            setLoadState("unauthorized");
            return;
          }
          if (!res.ok || !json.ok || !json.profile) {
            setError(json.error ?? "Could not load profile");
            setLoadState("error");
            return;
          }
          setProfile(json.profile);
          setLoadState("ready");
        } catch {
          if (!cancelled) {
            setError("Network error loading profile");
            setLoadState("error");
          }
        }
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [open]);

  if (!open) return null;

  function patchLocal(partial: Partial<OwnProfile>) {
    setProfile((prev) => (prev ? { ...prev, ...partial } : prev));
  }

  function toggleInterest(value: string) {
    if (!profile) return;
    const key = value.toLowerCase();
    const has = profile.interests.includes(key);
    patchLocal({
      interests: has
        ? profile.interests.filter((i) => i !== key)
        : [...profile.interests, key],
    });
  }

  function toggleDay(day: DayOfWeek) {
    if (!profile) return;
    const has = profile.availabilityDays.includes(day);
    patchLocal({
      availabilityDays: has
        ? profile.availabilityDays.filter((d) => d !== day)
        : [...profile.availabilityDays, day],
    });
  }

  async function setCityPin() {
    if (!profile?.city?.trim()) {
      setError("Enter a city before setting your discovery pin");
      return;
    }
    setPinBusy(true);
    setError(null);
    // Include state when possible so Nominatim doesn't pick a foreign namesake.
    const cityField = profile.city.trim();
    const hasStateHint = /,\s*[A-Za-z]{2,}\s*$/.test(cityField);
    const query = [
      profile.neighborhood?.trim(),
      hasStateHint ? cityField : `${cityField}, CA`,
    ]
      .filter(Boolean)
      .join(", ");
    const result = await geocodePlaceName(query);
    setPinBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (/\becuador\b/i.test(result.label) || /,\s*ec\b/i.test(result.label)) {
      setError(
        `That resolved to ${result.label}. Use a US city with state (e.g. “Stockton, CA”) and try again.`,
      );
      return;
    }
    patchLocal({
      discoveryLat: result.lat,
      discoveryLng: result.lng,
      city: profile.city,
    });
    setSaveNote(
      `Approximate pin set near ${result.label} (not live GPS). Save to publish.`,
    );
  }

  async function save() {
    if (!profile) return;
    setBusy(true);
    setError(null);
    setSaveNote(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
          bio: profile.bio,
          city: profile.city,
          neighborhood: profile.neighborhood,
          interests: profile.interests,
          skillLevel: profile.skillLevel,
          availabilityDays: profile.availabilityDays,
          availabilityStartHour: profile.availabilityStartHour,
          availabilityEndHour: profile.availabilityEndHour,
          preferredRadiusKm: profile.preferredRadiusKm,
          discoverable: profile.discoverable,
          discoveryLat: profile.discoveryLat,
          discoveryLng: profile.discoveryLng,
          locationShareLevel: profile.locationShareLevel,
          dmPolicy: profile.dmPolicy,
          // Forged ids must be ignored by the server:
          id: "00000000-0000-0000-0000-000000000000",
          userId: "forged-should-be-ignored",
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        profile?: OwnProfile;
      };
      if (res.status === 401) {
        setLoadState("unauthorized");
        return;
      }
      if (!res.ok || !json.ok || !json.profile) {
        setError(json.error ?? "Save failed");
        return;
      }
      setProfile(json.profile);
      setSaveNote("Profile saved to Supabase.");
    } catch {
      setError("Network error while saving");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    const { getSupabaseBrowserClient } = await import("@/lib/supabase/client");
    const client = getSupabaseBrowserClient();
    await client?.auth.signOut();
    setProfile(null);
    onSignedOut();
    onClose();
  }

  const interestChoices = [
    ...CATEGORY_OPTIONS.filter((c) => c.value !== "all").map((c) => c.value),
    ...EXTRA_INTERESTS,
  ];

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-title"
    >
      <button
        type="button"
        className="discovery-backdrop absolute inset-0"
        aria-label="Close profile"
        onClick={onClose}
      />
      <div className="discovery-slide-up relative z-10 flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-panel)] sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-elevated)]/60 px-4 py-3">
          <h2
            id="profile-title"
            className="font-[family-name:var(--font-display)] text-lg font-bold tracking-tight"
          >
            Your profile
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="overflow-y-auto p-4">
          {loadState === "loading" && (
            <p className="text-sm text-[var(--muted)]">Loading profile…</p>
          )}

          {loadState === "unauthorized" && (
            <div className="space-y-3">
              <p className="text-sm text-[var(--muted)]">
                Sign in to create and edit your Trailmap profile. Your email
                stays private.
              </p>
              <Button type="button" onClick={onRequestSignIn}>
                Sign in / Sign up
              </Button>
            </div>
          )}

          {loadState === "error" && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}

          {loadState === "ready" && profile && (
            <div className="space-y-4">
              <label className="block space-y-1">
                <span className="text-xs font-medium">Display name</span>
                <Input
                  value={profile.displayName}
                  onChange={(e) => patchLocal({ displayName: e.target.value })}
                  maxLength={80}
                  required
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-medium">
                  Photo URL (optional)
                </span>
                <Input
                  value={profile.avatarUrl ?? ""}
                  onChange={(e) =>
                    patchLocal({
                      avatarUrl: e.target.value.trim() ? e.target.value : null,
                    })
                  }
                  placeholder="https://…"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-medium">Short bio</span>
                <textarea
                  value={profile.bio ?? ""}
                  onChange={(e) => patchLocal({ bio: e.target.value })}
                  maxLength={500}
                  rows={3}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  placeholder="What you like to do outdoors or in the gym…"
                />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1">
                  <span className="text-xs font-medium">City</span>
                  <Input
                    value={profile.city ?? ""}
                    onChange={(e) =>
                      patchLocal({
                        city: e.target.value.trim() ? e.target.value : null,
                      })
                    }
                    placeholder="Stockton, CA"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium">Neighborhood</span>
                  <Input
                    value={profile.neighborhood ?? ""}
                    onChange={(e) =>
                      patchLocal({
                        neighborhood: e.target.value.trim()
                          ? e.target.value
                          : null,
                      })
                    }
                    placeholder="Optional"
                  />
                </label>
              </div>

              <div>
                <p className="mb-1.5 text-xs font-medium">Interests</p>
                <div className="flex flex-wrap gap-1.5">
                  {interestChoices.map((value) => {
                    const active = profile.interests.includes(value);
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => toggleInterest(value)}
                        className={cn(
                          "rounded-md px-2.5 py-1 text-xs font-medium capitalize",
                          active
                            ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                            : "bg-[var(--surface-elevated)] text-[var(--foreground)]",
                        )}
                      >
                        {value}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-xs font-medium">Skill level</p>
                <div className="flex flex-wrap gap-1.5">
                  {SKILLS.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => patchLocal({ skillLevel: s.id })}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-xs font-medium",
                        profile.skillLevel === s.id
                          ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                          : "bg-[var(--surface-elevated)]",
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-xs font-medium">Availability days</p>
                <div className="flex flex-wrap gap-1.5">
                  {DAYS.map((d) => {
                    const active = profile.availabilityDays.includes(d.id);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => toggleDay(d.id)}
                        className={cn(
                          "rounded-md px-2 py-1 text-xs font-medium",
                          active
                            ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                            : "bg-[var(--surface-elevated)]",
                        )}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1">
                  <span className="text-xs font-medium">From hour (0–23)</span>
                  <Input
                    type="number"
                    min={0}
                    max={23}
                    value={profile.availabilityStartHour ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      patchLocal({
                        availabilityStartHour:
                          v === "" ? null : Number.parseInt(v, 10),
                      });
                    }}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium">To hour (0–23)</span>
                  <Input
                    type="number"
                    min={0}
                    max={23}
                    value={profile.availabilityEndHour ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      patchLocal({
                        availabilityEndHour:
                          v === "" ? null : Number.parseInt(v, 10),
                      });
                    }}
                  />
                </label>
              </div>

              <label className="block space-y-1">
                <span className="text-xs font-medium">
                  Preferred activity radius (km)
                </span>
                <Input
                  type="number"
                  min={1}
                  max={200}
                  value={profile.preferredRadiusKm ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    patchLocal({
                      preferredRadiusKm:
                        v === "" ? null : Number.parseInt(v, 10),
                    });
                  }}
                  placeholder="e.g. 15"
                />
              </label>

              <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-3">
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={profile.discoverable}
                    onChange={(e) =>
                      patchLocal({
                        discoverable: e.target.checked,
                        locationShareLevel:
                          e.target.checked &&
                          profile.locationShareLevel === "hidden"
                            ? "approximate"
                            : profile.locationShareLevel,
                      })
                    }
                  />
                  <span>
                    Show me on the People map
                    <span className="mt-0.5 block text-xs text-[var(--muted)]">
                      Other Trailmap people can see your public profile at the
                      location level you choose below. Search stays private.
                      Never live GPS or a home address.
                    </span>
                  </span>
                </label>
                <div>
                  <p className="mb-1 text-xs font-medium">Location sharing</p>
                  <div className="space-y-1">
                    {LOCATION_SHARE_OPTIONS.map((opt) => (
                      <label
                        key={opt.id}
                        className="flex items-center gap-2 text-sm"
                      >
                        <input
                          type="radio"
                          name="locationShareLevel"
                          checked={profile.locationShareLevel === opt.id}
                          onChange={() =>
                            patchLocal({
                              locationShareLevel: opt.id,
                              discoverable:
                                opt.id === "hidden"
                                  ? false
                                  : profile.discoverable,
                            })
                          }
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>
                {profile.locationShareLevel === "approximate" && (
                  <>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={pinBusy}
                      onClick={() => void setCityPin()}
                    >
                      {pinBusy
                        ? "Locating…"
                        : "Set approximate pin from city"}
                    </Button>
                    {profile.discoveryLat != null &&
                      profile.discoveryLng != null && (
                        <p className="text-[10px] text-[var(--muted)]">
                          Pin stored near {profile.discoveryLat.toFixed(2)},{" "}
                          {profile.discoveryLng.toFixed(2)} (rounded)
                        </p>
                      )}
                  </>
                )}
              </div>

              <div>
                <p className="mb-1.5 text-xs font-medium">
                  Who can message you
                </p>
                <div className="space-y-1.5">
                  {DM_OPTIONS.map((opt) => (
                    <label
                      key={opt.id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input
                        type="radio"
                        name="dmPolicy"
                        checked={profile.dmPolicy === opt.id}
                        onChange={() => patchLocal({ dmPolicy: opt.id })}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>

              {error && (
                <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-600">
                  {error}
                </p>
              )}
              {saveNote && (
                <p className="rounded-lg bg-[var(--surface-elevated)] px-3 py-2 text-xs text-[var(--muted)]">
                  {saveNote}
                </p>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                <Button type="button" onClick={() => void save()} disabled={busy}>
                  {busy ? "Saving…" : "Save profile"}
                </Button>
                <Button type="button" variant="secondary" onClick={onClose}>
                  Close
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => void signOut()}
                >
                  Sign out
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
