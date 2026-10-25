import { describe, expect, it } from "vitest";
import {
  nextPostcardStage,
  resolveSelectionAfterFilter,
} from "@/lib/selection";

describe("resolveSelectionAfterFilter", () => {
  const visible = [{ id: "a" }, { id: "b" }];

  it("keeps the selected item when it remains visible", () => {
    expect(resolveSelectionAfterFilter({ id: "a" }, visible)).toEqual({
      id: "a",
    });
  });

  it("clears selection when filters hide the selected marker", () => {
    expect(resolveSelectionAfterFilter({ id: "z" }, visible)).toBeNull();
  });
});

describe("nextPostcardStage", () => {
  it("opens preview on marker select and detail from preview", () => {
    expect(nextPostcardStage("none", "select-marker")).toBe("preview");
    expect(nextPostcardStage("preview", "open-detail")).toBe("detail");
  });

  it("returns to preview when detail closes, and clears on preview close", () => {
    expect(nextPostcardStage("detail", "close-detail")).toBe("preview");
    expect(nextPostcardStage("preview", "close-preview")).toBe("none");
  });
});
