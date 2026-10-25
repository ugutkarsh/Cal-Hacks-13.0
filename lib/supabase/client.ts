/**
 * Browser Supabase client (anon key + cookie/local session via @supabase/ssr).
 * Service-role keys must never be imported into client components.
 */

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hasSupabaseConfig, publicEnv } from "@/lib/env";

let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (!hasSupabaseConfig()) {
    return null;
  }

  if (!browserClient) {
    browserClient = createBrowserClient(
      publicEnv.supabaseUrl!,
      publicEnv.supabaseAnonKey!,
    );
  }

  return browserClient;
}

export function isSupabaseReady(): boolean {
  return hasSupabaseConfig();
}
