/**
 * Decides whether to render Google Maps or the local fallback.
 * Pure helper so missing-key and load-error paths are unit-testable.
 */

export type MapRenderMode = "google" | "fallback";

export function resolveMapRenderMode(options: {
  hasApiKey: boolean;
  mapsLoadFailed: boolean;
}): MapRenderMode {
  if (!options.hasApiKey || options.mapsLoadFailed) {
    return "fallback";
  }
  return "google";
}
