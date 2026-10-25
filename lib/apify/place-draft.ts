/**
 * Shared validated place draft written by ClassPass (and similar) ingest.
 */

import type { DbCategory } from "@/types/database";

export type NormalizedPlaceImportDraft = {
  name: string;
  description: string;
  category: DbCategory;
  latitude: number;
  longitude: number;
  imageUrl: string | null;
  sourceUrl: string;
  sourceRecordId: string;
  sourceProvider: string;
  sourceType: "apify";
};

export type NormalizePlaceResult =
  | { ok: true; draft: NormalizedPlaceImportDraft }
  | { ok: false; reason: string; sourceRecordId: string | null };
