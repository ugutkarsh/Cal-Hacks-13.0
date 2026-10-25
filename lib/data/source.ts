/**
 * Explicit data-source boundary: demo (mock) vs supabase.
 * Never silently fall back to mock after a configured Supabase failure.
 */

import { hasSupabaseConfig } from "@/lib/env";

export type DataSourceMode = "demo" | "supabase";

export function resolveDataSourceMode(
  env: {
    hasSupabaseConfig: boolean;
    dataSourceOverride?: string | undefined;
  } = {
    hasSupabaseConfig: hasSupabaseConfig(),
    dataSourceOverride: process.env.NEXT_PUBLIC_DATA_SOURCE,
  },
): DataSourceMode {
  const override = env.dataSourceOverride?.trim().toLowerCase();
  if (override === "demo") return "demo";
  if (override === "supabase") {
    return env.hasSupabaseConfig ? "supabase" : "demo";
  }
  return env.hasSupabaseConfig ? "supabase" : "demo";
}

export function dataSourceLabel(mode: DataSourceMode): string {
  return mode === "demo"
    ? "Mock sample data — not live locations or real attendees"
    : "Supabase (public records)";
}
