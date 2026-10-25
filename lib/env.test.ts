import { afterEach, describe, expect, it, vi } from "vitest";

describe("hasGoogleMapsKey", () => {
  afterEach(() => {
    vi.resetModules();
    delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  });

  it("is false when the public Maps key is missing", async () => {
    delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    const { hasGoogleMapsKey } = await import("@/lib/env");
    expect(hasGoogleMapsKey()).toBe(false);
  });

  it("is false for placeholder your- values", async () => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = "your-google-maps-api-key";
    const { hasGoogleMapsKey } = await import("@/lib/env");
    expect(hasGoogleMapsKey()).toBe(false);
  });

  it("is true when a real-looking key is set", async () => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = "AIzaSyDemoKeyForTestsOnly";
    const { hasGoogleMapsKey } = await import("@/lib/env");
    expect(hasGoogleMapsKey()).toBe(true);
  });
});
