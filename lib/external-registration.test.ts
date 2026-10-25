import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearExternalRegistration,
  confirmExternalRegistration,
  isExternallyRegistered,
} from "@/lib/external-registration";

describe("external registration storage", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts unregistered and confirms per activity id", () => {
    expect(isExternallyRegistered("evt-1")).toBe(false);
    confirmExternalRegistration("evt-1");
    expect(isExternallyRegistered("evt-1")).toBe(true);
    expect(isExternallyRegistered("evt-2")).toBe(false);
  });

  it("scopes by owner id", () => {
    confirmExternalRegistration("evt-1", "user-a");
    expect(isExternallyRegistered("evt-1", "user-a")).toBe(true);
    expect(isExternallyRegistered("evt-1", "user-b")).toBe(false);
  });

  it("can clear a confirmation", () => {
    confirmExternalRegistration("evt-1");
    clearExternalRegistration("evt-1");
    expect(isExternallyRegistered("evt-1")).toBe(false);
  });
});
