/**
 * Shared validated draft written to Supabase activities by Apify ingest paths.
 */

import type { DbCategory } from "@/types/database";

/** Apify / platform slug stored on activities.source_provider (text). */
export type ImportSourceProvider = string;

export type NormalizedImportDraft = {
  title: string;
  description: string;
  category: DbCategory;
  startsAt: string;
  endsAt: string | null;
  latitude: number;
  longitude: number;
  imageUrl: string | null;
  sourceUrl: string;
  sourceRecordId: string;
  sourceProvider: ImportSourceProvider;
  sourceType: "apify";
  difficultyLabel: string | null;
  costCents: number | null;
  locationLabel: string | null;
  hostLabel: string | null;
};

export type NormalizeResult =
  | { ok: true; draft: NormalizedImportDraft }
  | { ok: false; reason: string; sourceRecordId: string | null };

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function parseIso(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * Canonical listing URL for dedupe (strip query/hash, trailing slash).
 */
export function normalizeSourceUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    u.hash = "";
    u.search = "";
    const path = u.pathname.replace(/\/+$/, "") || "/";
    return `${u.origin}${path}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase().replace(/\/+$/, "");
  }
}

/**
 * Stable source_record_id across Actors.
 * Prevents duplicates like `2003…` vs `eventbrite:2003…` on refresh.
 */
export function canonicalizeSourceRecordId(
  provider: string,
  rawId: string | null | undefined,
  sourceUrl?: string | null,
): string | null {
  const providerSlug = provider.trim().toLowerCase();
  const raw = rawId == null ? "" : String(rawId).trim();

  // Eventbrite numeric ticket ids
  if (providerSlug.includes("eventbrite") || /eventbrite\.com/i.test(sourceUrl ?? "")) {
    const fromRaw = raw.match(/(?:^|:)(\d{10,})$/);
    if (fromRaw?.[1]) return fromRaw[1];
    const fromUrl = (sourceUrl ?? "").match(/[-/](\d{10,})(?:\/|$|\?)/);
    if (fromUrl?.[1]) return fromUrl[1];
  }

  // Meetup event ids
  if (providerSlug.includes("meetup") || /meetup\.com/i.test(sourceUrl ?? "")) {
    const fromRaw = raw.match(/(?:^|:)(\d{6,})$/);
    if (fromRaw?.[1]) return fromRaw[1];
    const fromUrl = (sourceUrl ?? "").match(/\/events\/(\d+)/);
    if (fromUrl?.[1]) return fromUrl[1];
  }

  if (raw) {
    // Strip accidental "provider:" prefix so keys stay stable across Actors.
    const stripped = raw.replace(new RegExp(`^${providerSlug}:`, "i"), "");
    return stripped || raw;
  }

  if (sourceUrl?.trim()) {
    return `${providerSlug}:${normalizeSourceUrl(sourceUrl)}`.slice(0, 240);
  }
  return null;
}

/**
 * True when listing text clearly talks about a paid fee/cover (not "free").
 * Used to reject false `isFree` / cost_cents=0 from scrapers.
 */
export function descriptionMentionsPaidFee(text: string): boolean {
  const t = text.toLowerCase();
  if (!t.trim()) return false;
  if (/\b(free\s+event|no\s+cost|no\s+fee|complimentary)\b/.test(t)) {
    // Still paid if an explicit dollar fee appears nearby
    if (!/\$\s*\d/.test(t) && !/\bfee\s*:?\s*\$?\s*\d/.test(t)) return false;
  }
  return (
    /\bfee\s*:?\s*\$?\s*\d/.test(t) ||
    /\$\s*\d+(?:\.\d{1,2})?\s*(?:per\s+person|\/\s*person|\bpp\b|each)?/.test(
      t,
    ) ||
    /\b(admission|cover(\s+charge)?|entry\s+fee|ticket)\b[^.\n]{0,40}\$\s*\d/.test(
      t,
    ) ||
    /\bcosts?\b[^.\n]{0,20}\$\s*\d/.test(t) ||
    /\bpaid\s+(directly|at\s+entry|to\s+the)\b/.test(t)
  );
}

/**
 * Best-effort fee extraction from public listing text. Returns USD cents or null.
 * Does not invent prices — only parses explicit amounts.
 */
export function inferCostCentsFromText(text: string): number | null {
  if (!text.trim()) return null;
  const patterns = [
    /\bfee\s*:?\s*\$?\s*(\d+(?:\.\d{1,2})?)/i,
    /\b(?:admission|cover(?:\s+charge)?|entry\s+fee)\s*:?\s*\$?\s*(\d+(?:\.\d{1,2})?)/i,
    /\$\s*(\d+(?:\.\d{1,2})?)\s*(?:per\s+person|\/\s*person|\bpp\b|each)/i,
    /\bcosts?\s*:?\s*\$?\s*(\d+(?:\.\d{1,2})?)/i,
    /\$\s*(\d+(?:\.\d{1,2})?)\b/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m?.[1]) continue;
    const dollars = Number(m[1]);
    if (!Number.isFinite(dollars) || dollars < 0 || dollars > 10_000) continue;
    // Ignore likely false positives like years embedded without $
    if (dollars >= 1900 && dollars <= 2100 && !m[0].includes("$")) continue;
    return Math.round(dollars * 100);
  }
  return null;
}

/**
 * Merge structured scraper cost with description text.
 * Never keep Free (0) when the listing text states a fee.
 */
export function resolveCostCents(input: {
  structuredCents: number | null;
  isFree?: boolean | null;
  description?: string | null;
}): number | null {
  const description =
    typeof input.description === "string" ? input.description : "";
  const fromText = inferCostCentsFromText(description);
  const mentionsFee = descriptionMentionsPaidFee(description);

  if (
    isFiniteNumber(input.structuredCents) &&
    input.structuredCents > 0
  ) {
    return Math.round(input.structuredCents);
  }

  if (fromText != null && fromText > 0) {
    return fromText;
  }

  if (input.isFree === true) {
    if (mentionsFee) return null; // contradict free flag — unknown, not Free
    return 0;
  }

  if (input.structuredCents === 0) {
    if (mentionsFee) return null;
    return 0;
  }

  return null;
}

/** Map free-text / tags into Trailmap categories without inventing sports. */
export function mapRecreationCategory(haystack: string): DbCategory {
  const hay = haystack.toLowerCase();
  if (/hik|trail|backpack/.test(hay)) return "hiking";
  if (/cycl|bike|biking/.test(hay)) return "cycling";
  if (/run|jog|5k|10k|marathon|triathlon/.test(hay)) return "running";
  if (/climb|bould/.test(hay)) return "climbing";
  if (
    /badminton|volleyball|pickleball|basketball|soccer|futsal|tennis|squash|table tennis|ping.?pong|open gym|pickup|football|rugby|cricket|martial|boxing|yoga|pilates|swim|sports.?fitness|sports & fitness|hiit|fitness|gym|studio|strength train|bootcamp|barre|spin|classpass/.test(
      hay,
    )
  ) {
    return "sports";
  }
  if (/outdoor|camp|kayak|paddle|nature|park/.test(hay)) return "outdoor";
  if (/meetup|social|network|group/.test(hay)) return "meetup";
  return "other";
}
