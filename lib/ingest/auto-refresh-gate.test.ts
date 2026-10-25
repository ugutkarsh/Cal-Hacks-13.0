import { afterEach, describe, expect, it } from "vitest";
import {
  autoIngestMinIntervalMs,
  formatRetryAfter,
  resetAutoIngestGateForTests,
} from "@/lib/ingest/auto-refresh-gate";

describe("autoIngestMinIntervalMs", () => {
  const prev = process.env.AUTO_INGEST_MIN_INTERVAL_MINUTES;

  afterEach(() => {
    if (prev === undefined) delete process.env.AUTO_INGEST_MIN_INTERVAL_MINUTES;
    else process.env.AUTO_INGEST_MIN_INTERVAL_MINUTES = prev;
    resetAutoIngestGateForTests();
  });

  it("defaults to 1 minute", () => {
    delete process.env.AUTO_INGEST_MIN_INTERVAL_MINUTES;
    expect(autoIngestMinIntervalMs()).toBe(60_000);
  });

  it("honors a 1-minute env (does not bump to 180)", () => {
    process.env.AUTO_INGEST_MIN_INTERVAL_MINUTES = "1";
    expect(autoIngestMinIntervalMs()).toBe(60_000);
  });

  it("honors a 2-minute env", () => {
    process.env.AUTO_INGEST_MIN_INTERVAL_MINUTES = "2";
    expect(autoIngestMinIntervalMs()).toBe(120_000);
  });

  it("allows sub-minute intervals down to 15s floor", () => {
    process.env.AUTO_INGEST_MIN_INTERVAL_MINUTES = "0.25";
    expect(autoIngestMinIntervalMs()).toBe(15_000);
  });
});

describe("formatRetryAfter", () => {
  it("shows seconds under a minute", () => {
    expect(formatRetryAfter(45_000)).toBe("45s");
  });
});
