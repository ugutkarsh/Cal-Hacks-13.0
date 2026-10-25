/**
 * Activity-first matching helpers for community post recommendations.
 * Exact activity beats related alternatives; bare category is not enough.
 */

export type ActivityMatchKind = "exact" | "related" | "none";

/** Known related activities — used only as labeled alternatives, never as silent substitutes. */
const RELATED: Record<string, string[]> = {
  badminton: ["pickleball", "tennis", "squash", "racquetball", "table tennis", "ping pong"],
  pickleball: ["badminton", "tennis", "squash", "racquetball"],
  tennis: ["pickleball", "badminton", "squash", "racquetball"],
  squash: ["racquetball", "tennis", "badminton", "pickleball"],
  racquetball: ["squash", "tennis", "pickleball", "badminton"],
  soccer: ["football", "futsal"],
  football: ["soccer", "futsal"],
  basketball: ["volleyball"],
  volleyball: ["basketball"],
  running: ["jogging", "trail running", "hiking"],
  hiking: ["trail running", "walking", "running"],
  cycling: ["biking", "mountain biking"],
  yoga: ["pilates", "stretching"],
  climbing: ["bouldering", "rock climbing"],
};

/** Venue / court phrasing that strengthens a place match when paired with an activity. */
const VENUE_TOKENS = [
  "court",
  "courts",
  "club",
  "recreation",
  "rec center",
  "community center",
  "gym",
  "stadium",
  "field",
  "park",
  "arena",
];

export function normalizeActivityLabel(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  const t = value.trim().toLowerCase().replace(/\s+/g, " ");
  return t || null;
}

export function relatedActivities(activity: string | null | undefined): string[] {
  const key = normalizeActivityLabel(activity);
  if (!key) return [];
  const direct = RELATED[key];
  if (direct) return [...direct];
  // Partial key match (e.g. "badminton doubles")
  for (const [k, vals] of Object.entries(RELATED)) {
    if (key.includes(k) || k.includes(key)) return [...vals, k].filter((v) => v !== key);
  }
  return [];
}

/** Simple inflection variants so “hike” / “hikes” match activity “hiking”. */
function activitySurfaceForms(activity: string): string[] {
  const forms = new Set<string>([activity]);
  if (activity.endsWith("ing") && activity.length > 4) {
    const stem = activity.slice(0, -3); // hiking → hik
    forms.add(stem);
    forms.add(`${stem}e`); // hike
    forms.add(`${stem}es`); // hikes
    forms.add(`${stem}s`); // runs from running → run + s
  }
  if (activity.endsWith("ing") && activity.length > 5) {
    // running → run (drop "ning" quirk: runn → run)
    const doubled = activity.replace(/(\w)\1ing$/, "$1");
    if (doubled !== activity) {
      forms.add(doubled);
      forms.add(`${doubled}s`);
    }
  }
  return [...forms];
}

export function activityMatchInText(
  haystack: string,
  activity: string | null | undefined,
): ActivityMatchKind {
  const needle = normalizeActivityLabel(activity);
  if (!needle) return "none";
  const hay = haystack.toLowerCase();
  if (hay.includes(needle)) return "exact";
  for (const form of activitySurfaceForms(needle)) {
    if (form.length >= 3 && hay.includes(form)) return "exact";
  }
  for (const related of relatedActivities(needle)) {
    if (hay.includes(related)) return "related";
    for (const form of activitySurfaceForms(related)) {
      if (form.length >= 3 && hay.includes(form)) return "related";
    }
  }
  return "none";
}

export function activityMatchInList(
  items: string[],
  activity: string | null | undefined,
): ActivityMatchKind {
  const needle = normalizeActivityLabel(activity);
  if (!needle) return "none";
  const lower = items.map((i) => i.toLowerCase());
  if (lower.some((i) => i.includes(needle) || needle.includes(i))) return "exact";
  const related = relatedActivities(needle);
  if (lower.some((i) => related.some((r) => i.includes(r) || r.includes(i)))) {
    return "related";
  }
  return "none";
}

export function hasVenueCue(haystack: string): boolean {
  const hay = haystack.toLowerCase();
  return VENUE_TOKENS.some((t) => hay.includes(t));
}

export function matchedRelatedLabel(
  haystack: string,
  activity: string | null | undefined,
): string | null {
  const needle = normalizeActivityLabel(activity);
  if (!needle) return null;
  const hay = haystack.toLowerCase();
  for (const related of relatedActivities(needle)) {
    if (hay.includes(related)) return related;
  }
  return null;
}
