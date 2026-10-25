/**
 * Shared auth helper for messaging API routes.
 */

import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function requireMessagingUser(): Promise<
  | { supabase: SupabaseClient; user: User }
  | { error: NextResponse }
> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return {
      error: NextResponse.json(
        { ok: false, error: "Supabase is not configured" },
        { status: 503 },
      ),
    };
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error: NextResponse.json(
        { ok: false, error: "Sign in required" },
        { status: 401 },
      ),
    };
  }
  return { supabase, user };
}
