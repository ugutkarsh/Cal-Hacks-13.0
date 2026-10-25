/**
 * Public (browser-safe) environment configuration.
 * Never put SUPABASE_SERVICE_ROLE_KEY or APIFY_API_TOKEN here.
 *
 * IMPORTANT: Next.js only inlines NEXT_PUBLIC_* into the client bundle when
 * accessed as static property reads (process.env.NEXT_PUBLIC_FOO). Dynamic
 * process.env[key] returns undefined in the browser.
 */

function cleanPublic(value: string | undefined): string | undefined {
  if (!value || value.trim() === "" || value.startsWith("your-")) {
    return undefined;
  }
  return value.trim();
}

export const publicEnv = {
  googleMapsApiKey: cleanPublic(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY),
  googleMapsMapId:
    cleanPublic(process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID) ?? "DEMO_MAP_ID",
  supabaseUrl: cleanPublic(process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: cleanPublic(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
} as const;

export function hasGoogleMapsKey(): boolean {
  return Boolean(publicEnv.googleMapsApiKey);
}

export function hasSupabaseConfig(): boolean {
  return Boolean(publicEnv.supabaseUrl && publicEnv.supabaseAnonKey);
}
