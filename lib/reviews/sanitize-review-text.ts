/**
 * Sanitize user/review text before theme matching.
 * Strips common prompt-injection patterns; never treats text as instructions.
 */

const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/gi,
  /disregard\s+(all\s+)?(previous|prior|above)/gi,
  /system\s*:/gi,
  /<\s*\/?\s*system\s*>/gi,
  /you\s+are\s+(now\s+)?(?:a\s+)?(?:helpful\s+)?assistant/gi,
  /reveal\s+(your\s+)?(system\s+)?prompt/gi,
  /jailbreak/gi,
  /\bdo\s+not\s+follow\s+safety\b/gi,
];

/** Remove injection-like phrases; keep the rest for keyword evidence. */
export function sanitizeReviewText(input: string): string {
  if (typeof input !== "string") return "";
  let text = input.replace(/\0/g, "").trim();
  for (const re of INJECTION_PATTERNS) {
    text = text.replace(re, " ");
  }
  // Collapse whitespace; cap length so excerpts stay bounded.
  text = text.replace(/\s+/g, " ").trim().slice(0, 2000);
  return text;
}

export function looksLikePromptInjection(input: string): boolean {
  if (typeof input !== "string" || !input.trim()) return false;
  return INJECTION_PATTERNS.some((re) => {
    re.lastIndex = 0;
    return re.test(input);
  });
}
