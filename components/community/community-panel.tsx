"use client";

import { useCallback, useEffect, useState } from "react";
import { MessagesSquare, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CATEGORY_OPTIONS } from "@/lib/data/map-entities";
import { cn } from "@/lib/utils";
import type {
  CommunityPost,
  PostIntent,
  PostVisibility,
} from "@/types/community-post";
import type {
  CommunityPostInterest,
  CommunityPostReply,
} from "@/types/community-interaction";
import type { PostExtractionResult } from "@/types/community-extract";
import type { PostRecommendationsResult } from "@/types/community-recommendations";
import type { DayOfWeek, SkillPreference } from "@/types/preferences";
import type { ActivityCategory, EntityKind } from "@/types/map-entities";

const DAYS: { id: DayOfWeek; label: string }[] = [
  { id: "mon", label: "Mon" },
  { id: "tue", label: "Tue" },
  { id: "wed", label: "Wed" },
  { id: "thu", label: "Thu" },
  { id: "fri", label: "Fri" },
  { id: "sat", label: "Sat" },
  { id: "sun", label: "Sun" },
];

const INTENTS: { id: PostIntent; label: string }[] = [
  { id: "find_teammates", label: "Find teammates" },
  { id: "find_venue", label: "Find a venue" },
  { id: "join_activity", label: "Join an activity" },
  { id: "organize_meetup", label: "Organize a meetup" },
];

const SKILLS: { id: SkillPreference; label: string }[] = [
  { id: "any", label: "Any" },
  { id: "beginner", label: "Beginner" },
  { id: "intermediate", label: "Intermediate" },
  { id: "advanced", label: "Advanced" },
];

const VISIBILITIES: { id: PostVisibility; label: string }[] = [
  { id: "public", label: "Public" },
  { id: "author_discoverable", label: "When I'm discoverable" },
  { id: "private", label: "Only me" },
];

type Mode = "list" | "compose" | "detail" | "edit";

interface CommunityPanelProps {
  open: boolean;
  signedIn: boolean;
  onClose: () => void;
  onRequestSignIn: () => void;
  /** Open a catalog entity on the map (closes community overlay). */
  onOpenMapEntity?: (entityId: string, kind: EntityKind) => void;
  /** Start a private DM with a peer (authorized community interaction). */
  onMessageUser?: (peerId: string) => void;
}

type PublicAuthorPeek = {
  id: string;
  displayName: string;
  bio: string | null;
  city: string | null;
  neighborhood: string | null;
  interests: string[];
  acceptsMessages: boolean;
};

type Draft = {
  message: string;
  activity: string;
  category: ActivityCategory | "";
  city: string;
  neighborhood: string;
  preferredDays: DayOfWeek[];
  timeStartHour: string;
  timeEndHour: string;
  intent: PostIntent;
  skillLevel: SkillPreference | "";
  /** Dollars string for the form; converted to cents on submit. */
  budgetDollars: string;
  radiusKm: string;
  visibility: PostVisibility;
};

function emptyDraft(): Draft {
  return {
    message: "",
    activity: "",
    category: "",
    city: "",
    neighborhood: "",
    preferredDays: [],
    timeStartHour: "",
    timeEndHour: "",
    intent: "find_teammates",
    skillLevel: "",
    budgetDollars: "",
    radiusKm: "",
    visibility: "public",
  };
}

function draftFromPost(post: CommunityPost): Draft {
  return {
    message: post.message,
    activity: post.activity ?? "",
    category: post.category ?? "",
    city: post.city ?? "",
    neighborhood: post.neighborhood ?? "",
    preferredDays: [...post.preferredDays],
    timeStartHour:
      post.timeStartHour != null ? String(post.timeStartHour) : "",
    timeEndHour: post.timeEndHour != null ? String(post.timeEndHour) : "",
    intent: post.intent,
    skillLevel: post.skillLevel ?? "",
    budgetDollars:
      post.budgetCents != null ? String(post.budgetCents / 100) : "",
    radiusKm: post.radiusKm != null ? String(post.radiusKm) : "",
    visibility: post.visibility,
  };
}

function draftToPayload(draft: Draft) {
  let budgetCents: number | null = null;
  if (draft.budgetDollars.trim() !== "") {
    const dollars = Number(draft.budgetDollars);
    if (Number.isFinite(dollars) && dollars >= 0) {
      budgetCents = Math.round(dollars * 100);
    }
  }
  return {
    message: draft.message,
    activity: draft.activity.trim() || null,
    category: draft.category || null,
    city: draft.city.trim() || null,
    neighborhood: draft.neighborhood.trim() || null,
    preferredDays: draft.preferredDays,
    timeStartHour:
      draft.timeStartHour === "" ? null : Number(draft.timeStartHour),
    timeEndHour: draft.timeEndHour === "" ? null : Number(draft.timeEndHour),
    intent: draft.intent,
    skillLevel: draft.skillLevel || null,
    budgetCents,
    radiusKm: draft.radiusKm === "" ? null : Number(draft.radiusKm),
    visibility: draft.visibility,
  };
}

function intentLabel(intent: PostIntent): string {
  return INTENTS.find((i) => i.id === intent)?.label ?? intent;
}

function formatWhen(post: CommunityPost): string | null {
  const bits: string[] = [];
  if (post.preferredDays.length) {
    bits.push(post.preferredDays.map((d) => d.toUpperCase()).join(", "));
  }
  if (post.timeStartHour != null || post.timeEndHour != null) {
    const a =
      post.timeStartHour != null ? `${post.timeStartHour}:00` : "?";
    const b = post.timeEndHour != null ? `${post.timeEndHour}:00` : "?";
    bits.push(`${a}–${b}`);
  }
  return bits.length ? bits.join(" · ") : null;
}

export function CommunityPanel({
  open,
  signedIn,
  onClose,
  onRequestSignIn,
  onOpenMapEntity,
  onMessageUser,
}: CommunityPanelProps) {
  const [mode, setMode] = useState<Mode>("list");
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [selected, setSelected] = useState<CommunityPost | null>(null);
  const [authorPeek, setAuthorPeek] = useState<PublicAuthorPeek | null>(null);
  const [authorPeekError, setAuthorPeekError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [filterActivity, setFilterActivity] = useState("");
  const [filterCity, setFilterCity] = useState("");
  const [filterDay, setFilterDay] = useState<DayOfWeek | "">("");
  const [mineOnly, setMineOnly] = useState(false);
  const [nextCursor, setNextCursor] = useState<{
    createdAt: string;
    id: string;
  } | null>(null);
  const [loadState, setLoadState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [replies, setReplies] = useState<CommunityPostReply[]>([]);
  const [interestedUsers, setInterestedUsers] = useState<
    CommunityPostInterest[] | null
  >(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [interactionsBusy, setInteractionsBusy] = useState(false);
  const [extraction, setExtraction] = useState<PostExtractionResult | null>(
    null,
  );
  const [extractionBusy, setExtractionBusy] = useState(false);
  const [extractionConfirmed, setExtractionConfirmed] = useState(false);
  const [recs, setRecs] = useState<PostRecommendationsResult | null>(null);
  const [recsBusy, setRecsBusy] = useState(false);
  const [recsError, setRecsError] = useState<string | null>(null);

  const loadPosts = useCallback(
    async (opts?: { append?: boolean; cursor?: { createdAt: string; id: string } | null }) => {
      setLoadState("loading");
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set("limit", "20");
        params.set("status", "open");
        if (filterActivity.trim()) params.set("activity", filterActivity.trim());
        if (filterCity.trim()) params.set("city", filterCity.trim());
        if (filterDay) params.set("days", filterDay);
        if (mineOnly) params.set("mine", "true");
        if (opts?.cursor) {
          params.set("cursorCreatedAt", opts.cursor.createdAt);
          params.set("cursorId", opts.cursor.id);
        }
        const res = await fetch(`/api/posts?${params}`, {
          credentials: "include",
        });
        const json = (await res.json()) as {
          ok?: boolean;
          error?: string;
          posts?: CommunityPost[];
          nextCursor?: { createdAt: string; id: string } | null;
        };
        if (!res.ok || !json.ok || !json.posts) {
          setError(json.error ?? "Could not load posts");
          setLoadState("error");
          return;
        }
        setPosts((prev) =>
          opts?.append ? [...prev, ...json.posts!] : json.posts!,
        );
        setNextCursor(json.nextCursor ?? null);
        setLoadState("ready");
      } catch {
        setError("Network error loading posts");
        setLoadState("error");
      }
    },
    [filterActivity, filterCity, filterDay, mineOnly],
  );

  useEffect(() => {
    if (!open) return;
    setMode("list");
    setSelected(null);
    setNote(null);
    // Paint the panel chrome first, then fetch.
    const t = window.setTimeout(() => {
      void loadPosts();
    }, 0);
    return () => window.clearTimeout(t);
  }, [open, loadPosts]);

  if (!open) return null;

  function openCompose() {
    if (!signedIn) {
      onRequestSignIn();
      return;
    }
    setDraft(emptyDraft());
    setMode("compose");
    setError(null);
    setNote(null);
    setExtraction(null);
    setExtractionConfirmed(false);
  }

  async function suggestFromMessage() {
    if (!draft.message.trim()) {
      setError("Write a message before suggesting details");
      return;
    }
    setExtractionBusy(true);
    setError(null);
    setExtractionConfirmed(false);
    try {
      const timeZone =
        typeof Intl !== "undefined"
          ? Intl.DateTimeFormat().resolvedOptions().timeZone
          : undefined;
      const res = await fetch("/api/posts/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: draft.message,
          timeZone: timeZone ?? null,
        }),
      });
      const json = (await res.json()) as PostExtractionResult & {
        ok?: boolean;
        error?: string;
        llmConfigured?: boolean;
      };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Could not extract details");
        setExtraction(null);
        return;
      }
      setExtraction(json);
      if (json.engine === "unavailable") {
        setNote(
          json.limitation ??
            "Extraction unavailable — you can still fill fields manually and publish.",
        );
      } else {
        setNote(
          json.limitation ??
            "Review suggested details — nothing is applied until you confirm.",
        );
      }
    } catch {
      setError(
        "Extraction unavailable (network). You can still fill fields manually and publish.",
      );
      setExtraction(null);
    } finally {
      setExtractionBusy(false);
    }
  }

  function confirmExtraction() {
    if (!extraction || extraction.engine === "unavailable") return;
    const s = extraction.suggestedDraft;
    setDraft((d) => ({
      ...d,
      // Preserve original message text exactly.
      message: extraction.originalMessage || d.message,
      activity: s.activity ?? d.activity,
      category: s.category ?? d.category,
      city: s.city ?? d.city,
      neighborhood: s.neighborhood ?? d.neighborhood,
      preferredDays:
        s.preferredDays.length > 0 ? s.preferredDays : d.preferredDays,
      timeStartHour:
        s.timeStartHour != null ? String(s.timeStartHour) : d.timeStartHour,
      timeEndHour:
        s.timeEndHour != null ? String(s.timeEndHour) : d.timeEndHour,
      intent: s.intent ?? d.intent,
      skillLevel: s.skillLevel ?? d.skillLevel,
      budgetDollars:
        s.budgetCents != null
          ? String(s.budgetCents / 100)
          : d.budgetDollars,
      radiusKm: s.radiusKm != null ? String(s.radiusKm) : d.radiusKm,
    }));
    setExtractionConfirmed(true);
    setNote(
      mode === "edit"
        ? "Details applied from your message. Correct anything below, then save. Your original text is unchanged."
        : "Details applied from your message. Correct anything below, then publish. Your original text is unchanged.",
    );
  }

  function clearExtraction() {
    setExtraction(null);
    setExtractionConfirmed(false);
  }

  async function loadDetailInteractions(postId: string, isOwner: boolean) {
    setInteractionsBusy(true);
    try {
      const [postRes, repliesRes, interestRes] = await Promise.all([
        fetch(`/api/posts/${postId}`, { credentials: "include" }),
        fetch(`/api/posts/${postId}/replies?limit=50`, {
          credentials: "include",
        }),
        fetch(`/api/posts/${postId}/interest`, { credentials: "include" }),
      ]);

      const postJson = (await postRes.json()) as {
        ok?: boolean;
        post?: CommunityPost;
      };
      if (postRes.ok && postJson.ok && postJson.post) {
        setSelected(postJson.post);
      }

      const repliesJson = (await repliesRes.json()) as {
        ok?: boolean;
        replies?: CommunityPostReply[];
        replyCount?: number;
        error?: string;
      };
      if (repliesRes.ok && repliesJson.ok && repliesJson.replies) {
        setReplies(repliesJson.replies);
        setSelected((prev) =>
          prev
            ? {
                ...prev,
                replyCount:
                  repliesJson.replyCount ?? repliesJson.replies!.length,
              }
            : prev,
        );
      } else {
        setReplies([]);
      }

      const interestJson = (await interestRes.json()) as {
        ok?: boolean;
        interestCount?: number;
        viewerInterested?: boolean;
        interests?: CommunityPostInterest[] | null;
        error?: string;
      };
      if (interestRes.ok && interestJson.ok) {
        setSelected((prev) =>
          prev
            ? {
                ...prev,
                interestCount: interestJson.interestCount ?? 0,
                viewerInterested: Boolean(interestJson.viewerInterested),
              }
            : prev,
        );
        setInterestedUsers(
          isOwner && Array.isArray(interestJson.interests)
            ? interestJson.interests
            : null,
        );
      } else {
        setInterestedUsers(null);
      }
    } catch {
      setReplies([]);
      setInterestedUsers(null);
    } finally {
      setInteractionsBusy(false);
    }
  }

  async function loadRecommendations(postId: string) {
    setRecsBusy(true);
    setRecsError(null);
    setRecs(null);
    try {
      const res = await fetch(`/api/posts/${postId}/recommendations`, {
        credentials: "include",
      });
      let json: {
        ok?: boolean;
        error?: string;
        recommendations?: PostRecommendationsResult;
      } = {};
      try {
        json = (await res.json()) as typeof json;
      } catch {
        setRecsError(
          res.ok
            ? "Could not parse recommendations response"
            : `Recommendations failed (HTTP ${res.status})`,
        );
        return;
      }
      if (!res.ok || !json.ok || !json.recommendations) {
        setRecsError(json.error ?? "Could not load recommendations");
        return;
      }
      setRecs(json.recommendations);
    } catch {
      setRecsError("Network error loading recommendations");
    } finally {
      setRecsBusy(false);
    }
  }

  function openDetail(post: CommunityPost) {
    setSelected(post);
    setMode("detail");
    setError(null);
    setNote(null);
    setAuthorPeek(null);
    setAuthorPeekError(null);
    setReplies([]);
    setInterestedUsers(null);
    setReplyDraft("");
    setRecs(null);
    setRecsError(null);
    void loadDetailInteractions(post.id, post.isOwner);
    void loadRecommendations(post.id);
  }

  function openOnMap(entityId: string, kind: EntityKind) {
    onOpenMapEntity?.(entityId, kind);
    onClose();
  }

  async function toggleInterest() {
    if (!selected) return;
    if (!signedIn) {
      onRequestSignIn();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const interested = Boolean(selected.viewerInterested);
      const res = await fetch(`/api/posts/${selected.id}/interest`, {
        method: interested ? "DELETE" : "POST",
        credentials: "include",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        interestCount?: number;
        viewerInterested?: boolean;
      };
      if (res.status === 401) {
        onRequestSignIn();
        return;
      }
      if (!res.ok || (!json.ok && res.status !== 409)) {
        setError(json.error ?? "Could not update interest");
        return;
      }
      setSelected((prev) =>
        prev
          ? {
              ...prev,
              interestCount:
                json.interestCount ??
                (interested
                  ? Math.max(0, (prev.interestCount ?? 1) - 1)
                  : (prev.interestCount ?? 0) + 1),
              viewerInterested:
                json.viewerInterested ?? !interested,
            }
          : prev,
      );
      if (selected.isOwner) {
        void loadDetailInteractions(selected.id, true);
      }
      setNote(
        interested ? "Interest withdrawn." : "Marked as interested.",
      );
    } catch {
      setError("Network error updating interest");
    } finally {
      setBusy(false);
    }
  }

  async function submitReply() {
    if (!selected || !replyDraft.trim()) return;
    if (!signedIn) {
      onRequestSignIn();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/posts/${selected.id}/replies`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: replyDraft }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        reply?: CommunityPostReply;
        replyCount?: number;
      };
      if (res.status === 401) {
        onRequestSignIn();
        return;
      }
      if (!res.ok || !json.ok || !json.reply) {
        setError(json.error ?? "Could not post reply");
        return;
      }
      setReplies((prev) => [...prev, json.reply!]);
      setSelected((prev) =>
        prev
          ? { ...prev, replyCount: json.replyCount ?? (prev.replyCount ?? 0) + 1 }
          : prev,
      );
      setReplyDraft("");
      setNote("Reply posted.");
    } catch {
      setError("Network error posting reply");
    } finally {
      setBusy(false);
    }
  }

  async function deleteReply(replyId: string) {
    if (!selected) return;
    if (!window.confirm("Delete this reply?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/posts/${selected.id}/replies/${replyId}`,
        { method: "DELETE", credentials: "include" },
      );
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        replyCount?: number;
      };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Could not delete reply");
        return;
      }
      setReplies((prev) => prev.filter((r) => r.id !== replyId));
      setSelected((prev) =>
        prev
          ? {
              ...prev,
              replyCount:
                json.replyCount ?? Math.max(0, (prev.replyCount ?? 1) - 1),
            }
          : prev,
      );
      setNote("Reply deleted.");
    } catch {
      setError("Network error deleting reply");
    } finally {
      setBusy(false);
    }
  }

  async function loadAuthorPeek(authorId: string) {
    setAuthorPeekError(null);
    setAuthorPeek(null);
    try {
      const res = await fetch(`/api/profiles/${authorId}`, {
        credentials: "include",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        profile?: PublicAuthorPeek;
      };
      if (!res.ok || !json.ok || !json.profile) {
        setAuthorPeekError(json.error ?? "Profile not available");
        return;
      }
      setAuthorPeek({
        id: authorId,
        displayName: json.profile.displayName,
        bio: json.profile.bio ?? null,
        city: json.profile.city ?? null,
        neighborhood: json.profile.neighborhood ?? null,
        interests: json.profile.interests ?? [],
        acceptsMessages: Boolean(json.profile.acceptsMessages),
      });
    } catch {
      setAuthorPeekError("Could not load author profile");
    }
  }

  function openEdit(post: CommunityPost) {
    setSelected(post);
    setDraft(draftFromPost(post));
    setMode("edit");
    setError(null);
    setNote(null);
    setExtraction(null);
    setExtractionConfirmed(false);
  }

  async function submitCreate() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftToPayload(draft)),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        post?: CommunityPost;
      };
      if (res.status === 401) {
        onRequestSignIn();
        return;
      }
      if (!res.ok || !json.ok || !json.post) {
        setError(json.error ?? "Could not publish");
        return;
      }
      setSelected(json.post);
      setMode("detail");
      setNote("Post published.");
      void loadPosts();
    } catch {
      setError("Network error while publishing");
    } finally {
      setBusy(false);
    }
  }

  async function submitEdit() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/posts/${selected.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftToPayload(draft)),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        post?: CommunityPost;
      };
      if (!res.ok || !json.ok || !json.post) {
        setError(json.error ?? "Could not save");
        return;
      }
      setSelected(json.post);
      setMode("detail");
      setNote("Post updated.");
      void loadPosts();
    } catch {
      setError("Network error while saving");
    } finally {
      setBusy(false);
    }
  }

  async function deletePost() {
    if (!selected) return;
    if (!window.confirm("Delete this post? This cannot be undone.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/posts/${selected.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Could not delete");
        return;
      }
      setSelected(null);
      setMode("list");
      setNote("Post deleted.");
      void loadPosts();
    } catch {
      setError("Network error while deleting");
    } finally {
      setBusy(false);
    }
  }

  async function setPostStatus(status: "open" | "closed" | "archived") {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/posts/${selected.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        post?: CommunityPost;
      };
      if (!res.ok || !json.ok || !json.post) {
        setError(json.error ?? "Could not update post");
        return;
      }
      setSelected(json.post);
      setNote(
        status === "archived"
          ? "Post hidden from discovery."
          : status === "closed"
            ? "Post closed — no new interest or replies."
            : "Post reopened.",
      );
      void loadPosts();
    } catch {
      setError("Network error updating post");
    } finally {
      setBusy(false);
    }
  }

  async function reportTarget(
    targetType: "profile" | "post" | "reply" | "message",
    targetId: string,
  ) {
    if (!signedIn) {
      onRequestSignIn();
      return;
    }
    const reason = window.prompt(
      "Report reason: spam, harassment, inappropriate, impersonation, safety, or other.\nReporting does not guarantee removal.",
      "spam",
    );
    if (!reason) return;
    const normalized = reason.trim().toLowerCase();
    const allowed = [
      "spam",
      "harassment",
      "inappropriate",
      "impersonation",
      "safety",
      "other",
    ];
    if (!allowed.includes(normalized)) {
      setError("Pick a listed report reason");
      return;
    }
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType,
          targetId,
          reason: normalized,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        alreadyReported?: boolean;
        message?: string;
      };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Could not submit report");
        return;
      }
      setNote(
        json.message ??
          (json.alreadyReported
            ? "You already reported this. Reporting does not guarantee removal."
            : "Report submitted. Reporting does not guarantee removal or a specific outcome."),
      );
    } catch {
      setError("Could not submit report — try again. Nothing was auto-removed.");
    }
  }

  async function blockUser(userId: string) {
    if (!signedIn) {
      onRequestSignIn();
      return;
    }
    if (!window.confirm("Block this user? They won’t be able to message or interact with you.")) {
      return;
    }
    try {
      const res = await fetch("/api/blocks", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Could not block user");
        return;
      }
      setNote("User blocked.");
    } catch {
      setError("Network error blocking user");
    }
  }

  function toggleDay(day: DayOfWeek) {
    setDraft((d) => ({
      ...d,
      preferredDays: d.preferredDays.includes(day)
        ? d.preferredDays.filter((x) => x !== day)
        : [...d.preferredDays, day],
    }));
  }

  const title =
    mode === "compose"
      ? "New post"
      : mode === "edit"
        ? "Edit post"
        : mode === "detail"
          ? "Post"
          : "Community";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="community-title"
    >
      <button
        type="button"
        className="discovery-backdrop absolute inset-0"
        aria-label="Close community"
        onClick={onClose}
      />
      <div
        className={
          mode === "compose" || mode === "edit"
            ? "discovery-scale-in relative z-10 flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-panel)] sm:rounded-2xl"
            : "discovery-slide-up relative z-10 flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-panel)] sm:rounded-2xl"
        }
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-elevated)]/60 px-4 py-3">
          <div className="flex items-center gap-2">
            {(mode === "detail" || mode === "compose" || mode === "edit") && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setMode("list");
                  setSelected(null);
                  setError(null);
                }}
              >
                Back
              </Button>
            )}
            <h2
              id="community-title"
              className="font-[family-name:var(--font-display)] text-lg font-bold tracking-tight"
            >
              {title}
            </h2>
          </div>
          <div className="flex items-center gap-1">
            {mode === "list" && (
              <Button
                type="button"
                size="sm"
                onClick={openCompose}
                aria-label="Create a post"
              >
                <Plus className="h-4 w-4" />
                Post
              </Button>
            )}
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
        </div>

        <div className="overflow-y-auto p-4">
          {error && (
            <p className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}
          {note && (
            <p className="mb-3 rounded-lg bg-[var(--surface-elevated)] px-3 py-2 text-sm text-[var(--muted)]">
              {note}
            </p>
          )}

          {mode === "list" && (
            <div className="space-y-3">
              <p className="text-xs text-[var(--muted)]">
                Local posts from people nearby. Write naturally — activity and
                schedule fields are optional.
              </p>

              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1">
                  <span className="text-[10px] font-medium text-[var(--muted)]">
                    Activity
                  </span>
                  <Input
                    value={filterActivity}
                    onChange={(e) => setFilterActivity(e.target.value)}
                    placeholder="e.g. hiking"
                    className="h-8 text-xs"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-[10px] font-medium text-[var(--muted)]">
                    City
                  </span>
                  <Input
                    value={filterCity}
                    onChange={(e) => setFilterCity(e.target.value)}
                    placeholder="e.g. Oakland"
                    className="h-8 text-xs"
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-medium text-[var(--muted)]">
                  Day
                </span>
                {DAYS.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    aria-pressed={filterDay === d.id}
                    onClick={() =>
                      setFilterDay((cur) => (cur === d.id ? "" : d.id))
                    }
                    className={cn(
                      "rounded-md border px-2 py-0.5 text-[10px] font-medium",
                      filterDay === d.id
                        ? "border-transparent bg-[var(--accent)] text-[var(--accent-foreground)]"
                        : "border-[var(--border)] text-[var(--muted)]",
                    )}
                  >
                    {d.label}
                  </button>
                ))}
                {signedIn && (
                  <button
                    type="button"
                    aria-pressed={mineOnly}
                    onClick={() => setMineOnly((v) => !v)}
                    className={cn(
                      "ml-auto rounded-md border px-2 py-0.5 text-[10px] font-medium",
                      mineOnly
                        ? "border-transparent bg-[var(--accent)] text-[var(--accent-foreground)]"
                        : "border-[var(--border)] text-[var(--muted)]",
                    )}
                  >
                    Mine
                  </button>
                )}
              </div>

              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={() => void loadPosts()}
              >
                Apply filters
              </Button>

              {loadState === "loading" && posts.length === 0 && (
                <p className="text-sm text-[var(--muted)]">Loading posts…</p>
              )}

              {loadState === "ready" && posts.length === 0 && (
                <div className="rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-center">
                  <MessagesSquare className="mx-auto mb-2 h-6 w-6 text-[var(--muted)]" />
                  <p className="text-sm text-[var(--muted)]">
                    No posts yet. Be the first to ask for teammates or a meetup.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    className="mt-3"
                    onClick={openCompose}
                  >
                    Write a post
                  </Button>
                </div>
              )}

              <ul className="space-y-2">
                {posts.map((post) => (
                  <li key={post.id}>
                    <button
                      type="button"
                      onClick={() => openDetail(post)}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2.5 text-left transition-colors hover:bg-[var(--surface-hover)]"
                    >
                      <div className="mb-1 flex flex-wrap gap-1">
                        <Badge variant="person">{intentLabel(post.intent)}</Badge>
                        {post.activity && (
                          <Badge variant="event">{post.activity}</Badge>
                        )}
                        {post.isOwner && <Badge>Yours</Badge>}
                      </div>
                      <p className="line-clamp-2 text-sm text-[var(--foreground)]">
                        {post.message}
                      </p>
                      <p className="mt-1 text-[10px] text-[var(--muted)]">
                        {[
                          post.author?.displayName,
                          post.city,
                          formatWhen(post),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>

              {nextCursor && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  disabled={loadState === "loading"}
                  onClick={() =>
                    void loadPosts({ append: true, cursor: nextCursor })
                  }
                >
                  Load more
                </Button>
              )}
            </div>
          )}

          {(mode === "compose" || mode === "edit") && (
            <div className="space-y-3">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-[var(--foreground)]">
                  Message
                </span>
                <textarea
                  value={draft.message}
                  onChange={(e) => {
                    setDraft((d) => ({ ...d, message: e.target.value }));
                    setExtractionConfirmed(false);
                  }}
                  maxLength={2000}
                  rows={5}
                  placeholder="Looking for a Saturday hike near Oakland…"
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2.5 text-sm leading-relaxed shadow-inner outline-none transition-shadow focus-visible:bg-[var(--surface)] focus-visible:shadow-sm focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                />
                <span className="text-[10px] leading-snug text-[var(--muted)]">
                  {draft.message.length}/2000 — write naturally; structured
                  fields stay optional until you confirm suggestions
                </span>
              </label>
              {mode === "compose" && !draft.message.trim() && (
                <div className="flex flex-wrap gap-1.5">
                  {[
                    "Looking for a Saturday hike near Oakland…",
                    "Anyone want to play pickleball this week?",
                    "Beginner-friendly climbing partners?",
                  ].map((example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => {
                        setDraft((d) => ({ ...d, message: example }));
                        setExtractionConfirmed(false);
                      }}
                      className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[11px] text-[var(--foreground)] transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              )}

              {(mode === "compose" || mode === "edit") && (
                <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={extractionBusy || !draft.message.trim()}
                      onClick={() => void suggestFromMessage()}
                    >
                      {extractionBusy
                        ? "Reading message…"
                        : "Suggest details from message"}
                    </Button>
                    {extraction && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={clearExtraction}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                  <p className="text-[10px] leading-snug text-[var(--muted)]">
                    Uses a deterministic rules parser (not an LLM). Only
                    explicitly stated fields are suggested — ambiguity stays
                    unknown. Posts remain publishable if extraction fails.
                  </p>

                  {extraction && (
                    <div className="space-y-2 border-t border-[var(--border)] pt-2">
                      <p className="text-[10px] font-medium text-[var(--muted)]">
                        Engine: {extraction.engine}
                        {extraction.engine === "unavailable"
                          ? " · fill fields manually"
                          : extraction.limitation
                            ? " · review before saving"
                            : ""}
                      </p>
                      {extraction.reviewNotes.length > 0 && (
                        <ul className="space-y-0.5 text-[10px] text-[var(--muted)]">
                          {extraction.reviewNotes.map((n) => (
                            <li key={n}>• {n}</li>
                          ))}
                        </ul>
                      )}
                      {extraction.engine !== "unavailable" && (
                        <>
                          <ul className="space-y-1 text-xs">
                            {(
                              [
                                ["Activity", extraction.extracted.activity],
                                ["City", extraction.extracted.city],
                                [
                                  "Neighborhood",
                                  extraction.extracted.neighborhood,
                                ],
                                [
                                  "Days",
                                  {
                                    ...extraction.extracted.preferredDays,
                                    value: extraction.extracted.preferredDays
                                      .value
                                      ? extraction.extracted.preferredDays.value.join(
                                          ", ",
                                        )
                                      : null,
                                  },
                                ],
                                [
                                  "Start (local)",
                                  extraction.extracted.timeStartHour,
                                ],
                                [
                                  "End (local)",
                                  extraction.extracted.timeEndHour,
                                ],
                                [
                                  "Intents",
                                  {
                                    ...extraction.extracted.intents,
                                    value: extraction.extracted.intents.value
                                      ? extraction.extracted.intents.value.join(
                                          ", ",
                                        )
                                      : null,
                                  },
                                ],
                                ["Skill", extraction.extracted.skillLevel],
                                [
                                  "Budget (¢)",
                                  extraction.extracted.budgetCents,
                                ],
                              ] as const
                            ).map(([label, field]) => (
                              <li
                                key={label}
                                className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"
                              >
                                <span className="font-medium text-[var(--foreground)]">
                                  {label}:
                                </span>
                                <span>
                                  {field.value == null || field.value === ""
                                    ? "—"
                                    : String(field.value)}
                                </span>
                                <Badge
                                  className={cn(
                                    "text-[9px]",
                                    field.source === "unknown" ||
                                      field.source === "ambiguous"
                                      ? "opacity-80"
                                      : "",
                                  )}
                                >
                                  {field.source}
                                </Badge>
                              </li>
                            ))}
                          </ul>
                          {!extractionConfirmed ? (
                            <Button
                              type="button"
                              size="sm"
                              className="w-full"
                              onClick={confirmExtraction}
                            >
                              Confirm &amp; fill form (message stays as written)
                            </Button>
                          ) : (
                            <p className="text-[10px] text-[var(--muted)]">
                              Confirmed — edit fields below if needed, then{" "}
                              {mode === "edit" ? "save" : "publish"}.
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              <label className="block space-y-1">
                <span className="text-xs font-medium">Intent</span>
                <div className="flex flex-wrap gap-1.5">
                  {INTENTS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={draft.intent === item.id}
                      onClick={() =>
                        setDraft((d) => ({ ...d, intent: item.id }))
                      }
                      className={cn(
                        "rounded-md border px-2 py-1 text-xs font-medium",
                        draft.intent === item.id
                          ? "border-transparent bg-[var(--accent)] text-[var(--accent-foreground)]"
                          : "border-[var(--border)] text-[var(--muted)]",
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1">
                  <span className="text-xs font-medium">Activity</span>
                  <Input
                    value={draft.activity}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, activity: e.target.value }))
                    }
                    maxLength={80}
                    placeholder="Optional"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium">Category</span>
                  <select
                    value={draft.category}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        category: e.target.value as ActivityCategory | "",
                      }))
                    }
                    className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-sm"
                  >
                    <option value="">Optional</option>
                    {CATEGORY_OPTIONS.filter((c) => c.value !== "all").map(
                      (c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1">
                  <span className="text-xs font-medium">City</span>
                  <Input
                    value={draft.city}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, city: e.target.value }))
                    }
                    maxLength={80}
                    placeholder="City label"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium">Neighborhood</span>
                  <Input
                    value={draft.neighborhood}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        neighborhood: e.target.value,
                      }))
                    }
                    maxLength={80}
                    placeholder="Optional"
                  />
                </label>
              </div>

              <div>
                <span className="text-xs font-medium">Preferred days</span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {DAYS.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      aria-pressed={draft.preferredDays.includes(d.id)}
                      onClick={() => toggleDay(d.id)}
                      className={cn(
                        "rounded-md border px-2 py-1 text-xs font-medium",
                        draft.preferredDays.includes(d.id)
                          ? "border-transparent bg-[var(--accent)] text-[var(--accent-foreground)]"
                          : "border-[var(--border)] text-[var(--muted)]",
                      )}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <label className="block space-y-1">
                  <span className="text-xs font-medium">Start hour</span>
                  <Input
                    type="number"
                    min={0}
                    max={23}
                    value={draft.timeStartHour}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        timeStartHour: e.target.value,
                      }))
                    }
                    placeholder="0–23"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium">End hour</span>
                  <Input
                    type="number"
                    min={0}
                    max={23}
                    value={draft.timeEndHour}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        timeEndHour: e.target.value,
                      }))
                    }
                    placeholder="0–23"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium">Budget $</span>
                  <Input
                    type="number"
                    min={0}
                    step="1"
                    value={draft.budgetDollars}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        budgetDollars: e.target.value,
                      }))
                    }
                    placeholder="Optional"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium">Radius km</span>
                  <Input
                    type="number"
                    min={1}
                    max={200}
                    value={draft.radiusKm}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, radiusKm: e.target.value }))
                    }
                    placeholder="Optional"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1">
                  <span className="text-xs font-medium">Skill</span>
                  <select
                    value={draft.skillLevel}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        skillLevel: e.target.value as SkillPreference | "",
                      }))
                    }
                    className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-sm"
                  >
                    <option value="">Optional</option>
                    {SKILLS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium">Visibility</span>
                  <select
                    value={draft.visibility}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        visibility: e.target.value as PostVisibility,
                      }))
                    }
                    className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-sm"
                  >
                    {VISIBILITIES.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <Button
                type="button"
                className="w-full"
                disabled={busy || !draft.message.trim()}
                onClick={() =>
                  void (mode === "compose" ? submitCreate() : submitEdit())
                }
              >
                {busy
                  ? "Saving…"
                  : mode === "compose"
                    ? "Publish post"
                    : "Save changes"}
              </Button>
            </div>
          )}

          {mode === "detail" && selected && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="person">{intentLabel(selected.intent)}</Badge>
                {selected.activity && (
                  <Badge variant="event">{selected.activity}</Badge>
                )}
                {selected.category && <Badge>{selected.category}</Badge>}
                {selected.skillLevel && <Badge>{selected.skillLevel}</Badge>}
              </div>

              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {selected.message}
              </p>

              <dl className="space-y-1 text-xs text-[var(--muted)]">
                {(selected.city || selected.neighborhood) && (
                  <div>
                    <dt className="inline font-medium text-[var(--foreground)]">
                      Place:{" "}
                    </dt>
                    <dd className="inline">
                      {[selected.neighborhood, selected.city]
                        .filter(Boolean)
                        .join(", ")}
                    </dd>
                  </div>
                )}
                {formatWhen(selected) && (
                  <div>
                    <dt className="inline font-medium text-[var(--foreground)]">
                      When:{" "}
                    </dt>
                    <dd className="inline">{formatWhen(selected)}</dd>
                  </div>
                )}
                {selected.budgetCents != null && (
                  <div>
                    <dt className="inline font-medium text-[var(--foreground)]">
                      Budget:{" "}
                    </dt>
                    <dd className="inline">
                      ${(selected.budgetCents / 100).toFixed(0)}
                    </dd>
                  </div>
                )}
                {selected.radiusKm != null && (
                  <div>
                    <dt className="inline font-medium text-[var(--foreground)]">
                      Radius:{" "}
                    </dt>
                    <dd className="inline">~{selected.radiusKm} km</dd>
                  </div>
                )}
                <div>
                  <dt className="inline font-medium text-[var(--foreground)]">
                    Posted:{" "}
                  </dt>
                  <dd className="inline">
                    {new Date(selected.createdAt).toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="inline font-medium text-[var(--foreground)]">
                    Status:{" "}
                  </dt>
                  <dd className="inline">{selected.status}</dd>
                </div>
              </dl>

              {selected.author && (
                <div className="rounded-xl border border-[var(--border)] px-3 py-2">
                  <p className="text-xs font-medium">Author</p>
                  <p className="text-sm">{selected.author.displayName}</p>
                  {(selected.author.city || selected.author.neighborhood) && (
                    <p className="text-[10px] text-[var(--muted)]">
                      {[selected.author.neighborhood, selected.author.city]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                  )}
                  {selected.author.discoverable && !selected.isOwner && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => void loadAuthorPeek(selected.author!.id)}
                      >
                        View profile
                      </Button>
                      {signedIn && onMessageUser && (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => onMessageUser(selected.author!.id)}
                        >
                          Message
                        </Button>
                      )}
                    </div>
                  )}
                  {authorPeekError && (
                    <p className="mt-2 text-xs text-red-600">{authorPeekError}</p>
                  )}
                  {authorPeek && (
                    <div className="mt-2 space-y-1 border-t border-[var(--border)] pt-2 text-xs text-[var(--muted)]">
                      {authorPeek.bio && <p>{authorPeek.bio}</p>}
                      {(authorPeek.city || authorPeek.neighborhood) && (
                        <p>
                          {[authorPeek.neighborhood, authorPeek.city]
                            .filter(Boolean)
                            .join(", ")}
                        </p>
                      )}
                      {authorPeek.interests.length > 0 && (
                        <p>Interests: {authorPeek.interests.join(", ")}</p>
                      )}
                      {authorPeek.acceptsMessages &&
                        signedIn &&
                        onMessageUser && (
                          <Button
                            type="button"
                            size="sm"
                            className="mt-1"
                            onClick={() => onMessageUser(authorPeek.id)}
                          >
                            Message
                          </Button>
                        )}
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                <span>
                  {selected.interestCount ?? 0} interested
                </span>
                <span>·</span>
                <span>{selected.replyCount ?? replies.length} replies</span>
              </div>

              {selected.status === "open" && !selected.isOwner && (
                <Button
                  type="button"
                  variant={selected.viewerInterested ? "secondary" : "default"}
                  className="w-full"
                  disabled={busy}
                  onClick={() => void toggleInterest()}
                >
                  {selected.viewerInterested
                    ? "Withdraw interest"
                    : "I'm interested"}
                </Button>
              )}

              {selected.isOwner && interestedUsers && (
                <div className="rounded-xl border border-[var(--border)] px-3 py-2">
                  <p className="text-xs font-medium">
                    Interested ({interestedUsers.length})
                  </p>
                  {interestedUsers.length === 0 ? (
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      No one has expressed interest yet.
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-1.5">
                      {interestedUsers.map((item) => (
                        <li
                          key={item.id}
                          className="flex items-center justify-between gap-2 text-sm text-[var(--foreground)]"
                        >
                          <span>
                            {item.user?.displayName ?? "Community member"}
                            {(item.user?.city || item.user?.neighborhood) && (
                              <span className="text-[10px] text-[var(--muted)]">
                                {" "}
                                ·{" "}
                                {[item.user.neighborhood, item.user.city]
                                  .filter(Boolean)
                                  .join(", ")}
                              </span>
                            )}
                          </span>
                          {onMessageUser && item.userId && (
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={() => onMessageUser(item.userId)}
                            >
                              Message
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <p className="text-xs font-medium">Replies</p>
                {interactionsBusy && replies.length === 0 && (
                  <p className="text-xs text-[var(--muted)]">Loading replies…</p>
                )}
                {!interactionsBusy && replies.length === 0 && (
                  <p className="text-xs text-[var(--muted)]">
                    No replies yet.
                  </p>
                )}
                <ul className="space-y-2">
                  {replies.map((reply) => (
                    <li
                      key={reply.id}
                      className="rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-medium">
                            {reply.author?.displayName ?? "Community member"}
                          </p>
                          <p className="mt-0.5 whitespace-pre-wrap text-sm">
                            {reply.body}
                          </p>
                          <p className="mt-1 text-[10px] text-[var(--muted)]">
                            {new Date(reply.createdAt).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col gap-1">
                          {signedIn && !reply.isOwner && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                void reportTarget("reply", reply.id)
                              }
                            >
                              Report
                            </Button>
                          )}
                          {reply.isOwner && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={busy}
                              onClick={() => void deleteReply(reply.id)}
                            >
                              Delete
                            </Button>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>

                {selected.status === "open" && (
                  <div className="space-y-2">
                    <textarea
                      value={replyDraft}
                      onChange={(e) => setReplyDraft(e.target.value)}
                      maxLength={1000}
                      rows={2}
                      placeholder={
                        signedIn
                          ? "Write a reply…"
                          : "Sign in to reply"
                      }
                      disabled={!signedIn || busy}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-60"
                    />
                    <Button
                      type="button"
                      size="sm"
                      className="w-full"
                      disabled={busy || !replyDraft.trim()}
                      onClick={() => {
                        if (!signedIn) {
                          onRequestSignIn();
                          return;
                        }
                        void submitReply();
                      }}
                    >
                      {signedIn ? "Post reply" : "Sign in to reply"}
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-3 border-t border-[var(--border)] pt-3">
                <div>
                  <p className="text-xs font-medium">Recommendations</p>
                  <p className="text-[10px] text-[var(--muted)]">
                    Matched to this post’s activity
                    {selected.activity ? ` (${selected.activity})` : ""}. Exact
                    hits first; if none, nearby similar options (e.g. pickleball
                    for badminton) are labeled. Nothing is invented.
                  </p>
                </div>
                {recsBusy && (
                  <p className="text-xs text-[var(--muted)]">
                    Finding matches…
                  </p>
                )}
                {recsError && (
                  <p className="text-xs text-red-600">{recsError}</p>
                )}
                {recs && (
                  <div className="space-y-3">
                    <p className="text-[10px] text-[var(--muted)]">
                      Events, venues, and people matched to this post — exact
                      activity first, then similar nearby options.
                    </p>

                    <div className="space-y-1.5">
                      <p className="text-[11px] font-medium">Events</p>
                      {recs.events.items.length === 0 ? (
                        <p className="text-[10px] text-[var(--muted)]">
                          {recs.events.emptyReason}
                        </p>
                      ) : (
                        recs.events.items.map((item) => (
                          <div
                            key={`event-${item.id}`}
                            className="rounded-xl border border-[var(--border)] px-3 py-2"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="flex flex-wrap gap-1">
                                  <Badge variant="event">Event</Badge>
                                  {item.reasons.some(
                                    (r) => r.code === "similar_activity",
                                  ) ? (
                                    <Badge>Similar</Badge>
                                  ) : (
                                    <Badge>Exact</Badge>
                                  )}
                                </div>
                                <p className="mt-1 text-sm font-medium">
                                  {item.name}
                                </p>
                                <p className="text-[10px] text-[var(--muted)]">
                                  {item.locationLabel}
                                </p>
                              </div>
                              {onOpenMapEntity && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => openOnMap(item.id, "event")}
                                >
                                  Map
                                </Button>
                              )}
                            </div>
                            <ul className="mt-1 space-y-0.5 text-[10px] text-[var(--muted)]">
                              {item.reasons.slice(0, 3).map((r) => (
                                <li key={r.code + r.label}>· {r.label}</li>
                              ))}
                            </ul>
                            <p className="mt-1 text-[10px] text-[var(--muted)]">
                              {item.availabilityNote}
                            </p>
                            {item.sourceUrl && (
                              <a
                                href={item.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[10px] text-[var(--accent)] underline"
                              >
                                Source listing
                              </a>
                            )}
                          </div>
                        ))
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <p className="text-[11px] font-medium">
                        Courts &amp; clubs
                      </p>
                      {recs.venues.items.length === 0 ? (
                        <p className="text-[10px] text-[var(--muted)]">
                          {recs.venues.emptyReason}
                        </p>
                      ) : (
                        recs.venues.items.map((item) => (
                          <div
                            key={`venue-${item.id}`}
                            className="rounded-xl border border-[var(--border)] px-3 py-2"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="flex flex-wrap gap-1">
                                  <Badge variant="place">Venue</Badge>
                                  {item.reasons.some(
                                    (r) => r.code === "similar_activity",
                                  ) ? (
                                    <Badge>Similar</Badge>
                                  ) : (
                                    <Badge>Exact</Badge>
                                  )}
                                </div>
                                <p className="mt-1 text-sm font-medium">
                                  {item.name}
                                </p>
                                <p className="text-[10px] text-[var(--muted)]">
                                  {item.locationLabel}
                                </p>
                              </div>
                              {onOpenMapEntity && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => openOnMap(item.id, "place")}
                                >
                                  Map
                                </Button>
                              )}
                            </div>
                            <ul className="mt-1 space-y-0.5 text-[10px] text-[var(--muted)]">
                              {item.reasons.slice(0, 3).map((r) => (
                                <li key={r.code + r.label}>· {r.label}</li>
                              ))}
                            </ul>
                            <p className="mt-1 text-[10px] text-[var(--muted)]">
                              {item.availabilityNote}
                            </p>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <p className="text-[11px] font-medium">
                        People who might play
                      </p>
                      {recs.people.items.length === 0 ? (
                        <p className="text-[10px] text-[var(--muted)]">
                          {recs.people.emptyReason}
                        </p>
                      ) : (
                        recs.people.items.map((person) => (
                          <div
                            key={`person-${person.id}`}
                            className="rounded-xl border border-[var(--border)] px-3 py-2"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="flex flex-wrap gap-1">
                                  <Badge variant="person">Person</Badge>
                                  {person.reasons.some(
                                    (r) => r.code === "similar_activity",
                                  ) ? (
                                    <Badge>Similar</Badge>
                                  ) : (
                                    <Badge>Exact</Badge>
                                  )}
                                </div>
                                <p className="mt-1 text-sm font-medium">
                                  {person.displayName}
                                </p>
                                <p className="text-[10px] text-[var(--muted)]">
                                  {[person.neighborhood, person.city]
                                    .filter(Boolean)
                                    .join(", ") || person.presenceNote}
                                </p>
                              </div>
                              {onOpenMapEntity && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => openOnMap(person.id, "person")}
                                >
                                  Map
                                </Button>
                              )}
                            </div>
                            <ul className="mt-1 space-y-0.5 text-[10px] text-[var(--muted)]">
                              {person.reasons.slice(0, 4).map((r) => (
                                <li key={r.code + r.label}>· {r.label}</li>
                              ))}
                            </ul>
                            {person.activelyLooking &&
                              person.activelyLookingNote && (
                                <p className="mt-1 text-[10px] text-[var(--foreground)]">
                                  {person.activelyLookingNote}
                                </p>
                              )}
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                onClick={() => void loadAuthorPeek(person.id)}
                              >
                                View profile
                              </Button>
                              {!selected.isOwner &&
                                selected.status === "open" && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    disabled={busy}
                                    onClick={() => void toggleInterest()}
                                  >
                                    {selected.viewerInterested
                                      ? "Interested in post"
                                      : "Express interest on post"}
                                  </Button>
                                )}
                              {person.acceptsMessages &&
                              signedIn &&
                              onMessageUser ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => onMessageUser(person.id)}
                                >
                                  Message
                                </Button>
                              ) : person.acceptsMessages ? (
                                <span className="self-center text-[10px] text-[var(--muted)]">
                                  Sign in to message
                                </span>
                              ) : (
                                <span className="self-center text-[10px] text-[var(--muted)]">
                                  Messaging not enabled on their profile
                                </span>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {selected.isOwner && (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      className="flex-1"
                      onClick={() => openEdit(selected)}
                    >
                      Edit
                    </Button>
                    {selected.status === "open" && (
                      <Button
                        type="button"
                        variant="secondary"
                        className="flex-1"
                        disabled={busy}
                        onClick={() => void setPostStatus("closed")}
                      >
                        Close
                      </Button>
                    )}
                    {selected.status !== "archived" && (
                      <Button
                        type="button"
                        variant="secondary"
                        className="flex-1"
                        disabled={busy}
                        onClick={() => void setPostStatus("archived")}
                      >
                        Hide
                      </Button>
                    )}
                    {selected.status !== "open" && (
                      <Button
                        type="button"
                        variant="secondary"
                        className="flex-1"
                        disabled={busy}
                        onClick={() => void setPostStatus("open")}
                      >
                        Reopen
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      disabled={busy}
                      onClick={() => void deletePost()}
                    >
                      Delete
                    </Button>
                  </div>
                  <p className="text-[10px] text-[var(--muted)]">
                    Hide removes the post from discovery. Close keeps it
                    readable but stops new interest and replies.
                  </p>
                </div>
              )}

              {!selected.isOwner && signedIn && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void reportTarget("post", selected.id)}
                  >
                    Report post
                  </Button>
                  {selected.author && (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          void reportTarget("profile", selected.author!.id)
                        }
                      >
                        Report author
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void blockUser(selected.author!.id)}
                      >
                        Block author
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
