/**
 * Deterministic triage hints for human review — NOT a definitive judgment.
 * No LLM is configured for moderation in this project.
 * Never used to auto-hide, ban, or penalize users.
 */

import { looksLikePromptInjection } from "@/lib/privacy/sanitize-ugc";

export type TriageHint =
  | "keyword_spam"
  | "keyword_harassment"
  | "keyword_scam"
  | "possible_prompt_injection"
  | "insufficient_signal";

export type TriageResult = {
  /** Always rules-based in this repo. */
  engine: "deterministic-rules";
  /** Soft hints for a future reviewer — never enforcement. */
  hints: TriageHint[];
  /** Explicit: model output (if any) is not a verdict. */
  isDefinitiveJudgment: false;
  note: string;
};

const SPAM =
  /\b(?:buy\s+followers|crypto\s+airdrop|click\s+here\s+now|work\s+from\s+home\s+\$\$\$|nigerian\s+prince)\b/i;
const HARASS =
  /\b(?:kill\s+yourself|kys\b|you\s+should\s+die|i'?ll\s+find\s+you)\b/i;
const SCAM =
  /\b(?:send\s+(?:me\s+)?(?:your\s+)?(?:ssn|password|seed\s+phrase)|wire\s+transfer\s+immediately)\b/i;

/**
 * Flag potentially abusive/spam text for review only.
 * Empty / benign text → insufficient_signal (or empty hints).
 */
export function triageUntrustedText(text: string | null | undefined): TriageResult {
  const note =
    "Rules-based triage aid only — not a definitive judgment. Never auto-penalize from these hints alone. No LLM moderation is configured.";

  if (!text || !text.trim()) {
    return {
      engine: "deterministic-rules",
      hints: ["insufficient_signal"],
      isDefinitiveJudgment: false,
      note,
    };
  }

  const hints: TriageHint[] = [];
  if (SPAM.test(text)) hints.push("keyword_spam");
  if (HARASS.test(text)) hints.push("keyword_harassment");
  if (SCAM.test(text)) hints.push("keyword_scam");
  if (looksLikePromptInjection(text)) hints.push("possible_prompt_injection");

  if (hints.length === 0) {
    hints.push("insufficient_signal");
  }

  return {
    engine: "deterministic-rules",
    hints,
    isDefinitiveJudgment: false,
    note,
  };
}

/** Enforcement gate — always false in this product. */
export function shouldAutoPenalizeFromTriage(_triage: TriageResult): false {
  return false;
}
