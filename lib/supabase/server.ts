/**
 * Server Supabase client with cookie-backed Auth session.
 * Never import SUPABASE_SERVICE_ROLE_KEY into browser bundles.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hasSupabaseConfig, publicEnv } from "@/lib/env";

export async function createSupabaseServerClient(): Promise<SupabaseClient | null> {
  if (!hasSupabaseConfig()) {
    return null;
  }

  const cookieStore = await cookies();

  return createServerClient(
    publicEnv.supabaseUrl!,
    publicEnv.supabaseAnonKey!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from a Server Component — middleware will refresh sessions.
          }
        },
      },
    },
  );
}
