/**
 * Server-only Supabase client using the service role key.
 * NEVER import this module from client components or NEXT_PUBLIC code paths.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function createSupabaseAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || url.startsWith("your-")) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");
  }
  if (!serviceKey || serviceKey.startsWith("your-")) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured (server-only; required for Apify ingest upserts)",
    );
  }

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
