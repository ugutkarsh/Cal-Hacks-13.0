/**
 * Enrich short Apify summaries by fetching the public Meetup/Eventbrite page.
 * Never invents text — only stores what the public page exposes.
 * Server-only; used during ingest.
 */

const MAX_DESCRIPTION_CHARS = 12_000;
const MIN_IMPROVEMENT_CHARS = 80;
const FETCH_TIMEOUT_MS = 12_000;

export function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function decodeBasicEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, '"')
    .trim();
}

function collectJsonLdDescriptions(html: string): string[] {
  const out: string[] = [];
  const re =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      const parsed: unknown = JSON.parse(raw);
      const stack: unknown[] = [parsed];
      while (stack.length) {
        const node = stack.pop();
        if (!node) continue;
        if (Array.isArray(node)) {
          stack.push(...node);
          continue;
        }
        if (typeof node !== "object") continue;
        const obj = node as Record<string, unknown>;
        const type = obj["@type"];
        const isEvent =
          type === "Event" ||
          (Array.isArray(type) && type.includes("Event"));
        if (isEvent && typeof obj.description === "string") {
          out.push(decodeBasicEntities(obj.description));
        }
        for (const v of Object.values(obj)) {
          if (v && typeof v === "object") stack.push(v);
        }
      }
    } catch {
      // ignore malformed JSON-LD
    }
  }
  return out;
}

function metaContent(html: string, key: string): string | null {
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`,
      "i",
    ),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decodeBasicEntities(m[1]);
  }
  return null;
}

function extractFromNextData(html: string): string | null {
  const m = html.match(
    /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (!m?.[1]) return null;
  try {
    const data = JSON.parse(m[1]) as unknown;
    const found: string[] = [];
    const walk = (node: unknown, depth: number) => {
      if (depth > 14 || node == null) return;
      if (typeof node === "string") {
        if (
          node.length > 120 &&
          /when|where|bring|join|meet|hike|event|welcome|session/i.test(node)
        ) {
          found.push(node);
        }
        return;
      }
      if (Array.isArray(node)) {
        for (const item of node) walk(item, depth + 1);
        return;
      }
      if (typeof node === "object") {
        const obj = node as Record<string, unknown>;
        for (const [k, v] of Object.entries(obj)) {
          if (
            typeof v === "string" &&
            /description|eventDescription|body|details|about/i.test(k) &&
            v.length > 40
          ) {
            found.push(v);
          } else {
            walk(v, depth + 1);
          }
        }
      }
    };
    walk(data, 0);
    if (found.length === 0) return null;
    return found.sort((a, b) => b.length - a.length)[0] ?? null;
  } catch {
    return null;
  }
}

function extractFromKnownContainers(html: string): string | null {
  const patterns = [
    /id=["']event-details["'][^>]*>([\s\S]*?)<\/(?:div|section)/i,
    /data-testid=["'][^"']*description[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|section|p)/i,
    /class=["'][^"']*eventDescription[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|section)/i,
    /class=["'][^"']*description[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|section)/i,
  ];
  const texts: string[] = [];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) {
      const t = stripHtmlToText(m[1]);
      if (t.length > 80) texts.push(t);
    }
  }
  if (texts.length === 0) return null;
  return texts.sort((a, b) => b.length - a.length)[0] ?? null;
}

/**
 * Pure HTML → best description candidate (for unit tests + enrich).
 */
export function extractDescriptionFromEventHtml(html: string): string | null {
  const candidates: string[] = [];

  for (const d of collectJsonLdDescriptions(html)) {
    if (d.length > 40) candidates.push(d);
  }

  const next = extractFromNextData(html);
  if (next) candidates.push(stripHtmlToText(next));

  const container = extractFromKnownContainers(html);
  if (container) candidates.push(container);

  const og = metaContent(html, "og:description");
  if (og && og.length > 40) candidates.push(og);

  if (candidates.length === 0) return null;

  const best = candidates
    .map((c) => stripHtmlToText(c).slice(0, MAX_DESCRIPTION_CHARS))
    .filter((c) => c.length > 40)
    .sort((a, b) => b.length - a.length)[0];

  return best ?? null;
}

function isAllowedEventUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    return (
      host === "www.meetup.com" ||
      host === "meetup.com" ||
      host.endsWith(".meetup.com") ||
      host === "www.eventbrite.com" ||
      host === "eventbrite.com" ||
      host.endsWith(".eventbrite.com")
    );
  } catch {
    return false;
  }
}

/** Apify / Meetup often cut mid-sentence with "..." or "***AI". */
export function looksTruncatedDescription(text: string): boolean {
  const t = text.trim();
  if (t.length < 40) return false;
  const tail = t.slice(-32);
  return /(\.\.\.|…|\*\*\*AI|\*\*\*|\[truncated\]|read more|…\s*$)/i.test(tail);
}

/**
 * Prefer enriched page text when it is meaningfully longer than the Apify summary.
 * If the Apify summary already looks truncated, accept any longer page extract.
 */
export function preferRicherDescription(
  summary: string,
  enriched: string | null,
): string {
  const base = summary.trim();
  if (!enriched) return base;
  const rich = enriched.trim();
  if (base.length === 0 && rich.length > 0) return rich;
  if (looksTruncatedDescription(base) && rich.length > base.length) return rich;
  if (rich.length >= base.length + MIN_IMPROVEMENT_CHARS) return rich;
  return base;
}

export async function enrichDescriptionFromSourceUrl(
  sourceUrl: string,
  summary: string,
): Promise<string> {
  if (!isAllowedEventUrl(sourceUrl)) return summary.trim();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(sourceUrl, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent":
          "TrailmapBot/1.0 (+local ingest; public event page enrichment)",
      },
    });
    if (!res.ok) return summary.trim();
    const html = await res.text();
    const extracted = extractDescriptionFromEventHtml(html);
    return preferRicherDescription(summary, extracted);
  } catch {
    return summary.trim();
  } finally {
    clearTimeout(timer);
  }
}
