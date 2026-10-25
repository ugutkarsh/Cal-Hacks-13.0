import type { SkillPreference } from "@/types/preferences";

export type InferredSkill = "beginner" | "intermediate" | "advanced" | null;

/** Infer skill from free-text difficulty labels. Returns null when unknown. */
export function inferSkillFromLabel(label: string | null | undefined): InferredSkill {
  if (!label || !label.trim()) return null;
  const t = label.toLowerCase();
  if (
    /beginner|easy|casual|all paces|open to all|friendly|intro/.test(t)
  ) {
    return "beginner";
  }
  if (/advanced|expert|hard|strenuous|difficult/.test(t)) {
    return "advanced";
  }
  if (/intermediate|moderate|challenging/.test(t)) {
    return "intermediate";
  }
  return null;
}

export function skillCompatible(
  preference: SkillPreference,
  inferred: InferredSkill,
): "fit" | "unknown" | "mismatch" {
  if (preference === "any") return inferred == null ? "unknown" : "fit";
  if (inferred == null) return "unknown";
  if (preference === inferred) return "fit";
  // Beginner preference rejects advanced; intermediate accepts beginner+intermediate
  if (preference === "beginner" && inferred !== "beginner") return "mismatch";
  if (preference === "intermediate" && inferred === "advanced") return "mismatch";
  if (preference === "advanced") return inferred === "advanced" ? "fit" : "mismatch";
  return "fit";
}
