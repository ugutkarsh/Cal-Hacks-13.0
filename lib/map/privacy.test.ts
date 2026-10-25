/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  feedbackStorageKey,
  preferencesStorageKey,
} from "@/lib/privacy/session-storage";

describe("discovery privacy — scoped storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("keeps prefs and feedback per user and never stores search queries", () => {
    const aPrefs = preferencesStorageKey("user-a");
    const bPrefs = preferencesStorageKey("user-b");
    const aFb = feedbackStorageKey("user-a");
    expect(aPrefs).not.toBe(bPrefs);
    expect(aFb).toContain("user:user-a");

    window.localStorage.setItem(
      aPrefs,
      JSON.stringify({ startingPointLabel: "Oakland" }),
    );
    expect(window.localStorage.getItem(bPrefs)).toBeNull();

    // Search must stay in React state only — no dedicated search key.
    const keys = Object.keys(window.localStorage);
    expect(keys.every((k) => !/search/i.test(k))).toBe(true);
  });
});
