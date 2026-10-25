/**
 * Keep postcard selection consistent with visible filtered markers.
 */

export function resolveSelectionAfterFilter<T extends { id: string }>(
  selected: T | null,
  visible: T[],
): T | null {
  if (!selected) return null;
  return visible.some((item) => item.id === selected.id) ? selected : null;
}

/**
 * Preview → detail navigation state.
 */
export type PostcardStage = "none" | "preview" | "detail";

export function nextPostcardStage(
  current: PostcardStage,
  action: "select-marker" | "open-detail" | "close-detail" | "close-preview" | "clear",
): PostcardStage {
  switch (action) {
    case "select-marker":
      return "preview";
    case "open-detail":
      return current === "preview" || current === "detail" ? "detail" : current;
    case "close-detail":
      return current === "detail" ? "preview" : current;
    case "close-preview":
    case "clear":
      return "none";
    default:
      return current;
  }
}
