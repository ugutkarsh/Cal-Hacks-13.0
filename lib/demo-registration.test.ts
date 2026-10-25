import { describe, expect, it } from "vitest";
import {
  applyDemoJoin,
  confirmExternalJoin,
  demoJoinCaption,
  initialDemoRegistration,
  joinButtonLabel,
  shouldOpenExternalRegistration,
} from "@/lib/demo-registration";

const mockEvent = {
  isRegistrationOpen: true,
  provenance: "mock" as const,
};

const lumaEvent = {
  isRegistrationOpen: true,
  provenance: "apify" as const,
  sourceUrl: "https://lu.ma/example-event",
};

describe("demo registration", () => {
  it("registers once with UI-only messaging for mock events", () => {
    const next = applyDemoJoin(initialDemoRegistration(), mockEvent);
    expect(next.registered).toBe(true);
    expect(next.message).toMatch(/UI only|not saved to a server/i);
  });

  it("prevents duplicate registration with clear feedback", () => {
    const first = applyDemoJoin(initialDemoRegistration(), mockEvent);
    const second = applyDemoJoin(first, mockEvent);
    expect(second.registered).toBe(true);
    expect(second.message).toMatch(/already registered/i);
  });

  it("rejects join when registration is closed", () => {
    const next = applyDemoJoin(initialDemoRegistration(), {
      isRegistrationOpen: false,
      provenance: "mock",
    });
    expect(next.registered).toBe(false);
    expect(next.message).toMatch(/closed/i);
  });

  it("uses demo caption before any join", () => {
    expect(demoJoinCaption(initialDemoRegistration(), mockEvent)).toBe(
      "Demo registration action",
    );
  });
});

describe("imported listing registration", () => {
  it("detects external registration URLs for Apify imports", () => {
    expect(shouldOpenExternalRegistration(lumaEvent)).toBe(true);
    expect(shouldOpenExternalRegistration(mockEvent)).toBe(false);
  });

  it("does not auto-register when opening the host listing", () => {
    const next = applyDemoJoin(initialDemoRegistration(), lumaEvent);
    expect(next.registered).toBe(false);
    expect(next.awaitingExternalConfirm).toBe(true);
    expect(joinButtonLabel(initialDemoRegistration(), lumaEvent)).toBe(
      "Register on listing",
    );
  });

  it("marks registered only after explicit confirm", () => {
    const opened = applyDemoJoin(initialDemoRegistration(), lumaEvent);
    const confirmed = confirmExternalJoin(opened);
    expect(confirmed.registered).toBe(true);
    expect(joinButtonLabel(confirmed, lumaEvent)).toBe("You’re registered");
  });
});
