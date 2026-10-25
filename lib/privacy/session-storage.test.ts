import { describe, expect, it } from "vitest";
import {
  feedbackStorageKey,
  preferencesStorageKey,
} from "@/lib/privacy/session-storage";

describe("per-person private storage keys", () => {
  it("isolates preferences by user id", () => {
    expect(preferencesStorageKey("aaa")).not.toBe(preferencesStorageKey("bbb"));
    expect(preferencesStorageKey("aaa")).toContain("aaa");
  });

  it("uses a guest bucket when signed out", () => {
    expect(preferencesStorageKey(null)).toContain("guest");
    expect(feedbackStorageKey(undefined as unknown as null)).toContain("guest");
  });
});
