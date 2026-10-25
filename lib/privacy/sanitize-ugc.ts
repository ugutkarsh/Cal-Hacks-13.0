/**
 * Treat user-generated text as untrusted.
 * Strip prompt-injection phrases; never treat UGC as system instructions.
 * Shared by reports, reviews, and any future triage path.
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
  /exfiltrate|leak\s+(all\s+)?(private|secret)/gi,
];

export function sanitizeUntrustedText(
  input: string,
  maxLen = 1000,
): string {
  if (typeof input !== "string") return "";
  let text = input.replace(/\0/g, "").trim();
  for (const re of INJECTION_PATTERNS) {
    text = text.replace(re, " ");
  }
  return text.replace(/\s+/g, " ").trim().slice(0, maxLen);
}

export function looksLikePromptInjection(input: string): boolean {
  if (typeof input !== "string" || !input.trim()) return false;
  return INJECTION_PATTERNS.some((re) => {
    re.lastIndex = 0;
    return re.test(input);
  });
}
