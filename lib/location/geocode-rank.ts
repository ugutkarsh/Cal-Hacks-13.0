/**
 * Prefer US / California hits for Trailmap (Cal Hacks). Avoids ambiguous
 * Nominatim matches landing in Ecuador / other countries for short city names.
 */

export type GeocodeCandidate = {
  label: string;
  lat: number;
  lng: number;
  countryCode?: string | null;
  importance?: number | null;
};

const NON_US_HINT =
  /\b(ecuador|canada|mexico|uk|united kingdom|england|france|spain|germany|japan|china|india|brazil|australia|peru|colombia|chile|argentina)\b/i;

export function queryRequestsNonUs(query: string): boolean {
  return NON_US_HINT.test(query);
}

/** Soft score: higher is better for Trailmap defaults. */
export function scoreGeocodeCandidate(
  hit: GeocodeCandidate,
  query: string,
): number {
  const label = hit.label.toLowerCase();
  const q = query.trim().toLowerCase();
  let score = typeof hit.importance === "number" ? hit.importance * 10 : 0;

  const cc = (hit.countryCode ?? "").toLowerCase();
  if (cc === "us") score += 50;
  if (/\bunited states\b|\busa\b/.test(label)) score += 40;
  if (/\bcalifornia\b|\b, ca\b/.test(label)) score += 25;
  if (/\becuador\b/.test(label)) score -= 80;

  // Prefer labels that start with the typed city token.
  const firstToken = q.split(",")[0]?.trim() ?? q;
  if (firstToken && label.startsWith(firstToken)) score += 15;

  return score;
}

export function rankGeocodeCandidates(
  hits: GeocodeCandidate[],
  query: string,
): GeocodeCandidate[] {
  return [...hits].sort(
    (a, b) => scoreGeocodeCandidate(b, query) - scoreGeocodeCandidate(a, query),
  );
}
