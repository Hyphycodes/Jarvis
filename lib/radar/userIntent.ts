import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { convertSingleCandidate, type CandidateConversionResult } from "@/lib/radar/candidateConversion";
import { preBuildPlansForShownItems } from "@/lib/radar/planPreBuilder";
import { normalizeRadarCategory, type RadarCategory } from "@/lib/radar/category";
import type { Json } from "@/lib/types/database";

export type UserIntentInput = {
  userId: string;
  /** The thing the owner wants to do/try/get — e.g. "Pizz'Amici". */
  title: string;
  /** Free-text note / the original phrasing for context + research. */
  note?: string | null;
  /** A timing hint like "next week", "Friday night" (kept, not turned into a fake date). */
  dateHint?: string | null;
  /** Optional explicit category; otherwise derived from kind/title. */
  category?: string | null;
  /** Coarse kind to help categorize when no category is given. */
  kind?: "place" | "event" | "style" | null;
  url?: string | null;
  origin?: "chat" | "voice";
  supabase?: SupabaseClient;
};

// Owner asks lead the research queue. selectFairly puts user_intent first.
const USER_INTENT_SCORE = 0.95;

/**
 * Record an explicit owner ask as a `user_intent` Candidate Inbox row. This is
 * the single front door for chat/voice intent — it enters the SAME inbox the
 * category agents use, so it flows through the identical researcher → verdict →
 * surface pipeline, just prioritized. Find-or-create (idempotent by title).
 */
export async function captureUserIntent(input: UserIntentInput): Promise<string> {
  const supabase = input.supabase ?? getSupabaseServiceClient();
  const title = input.title.trim();
  if (!title) throw new Error("captureUserIntent: empty title");

  const category = resolveCategory(input);
  const entityType = entityTypeFor(category, input.kind);
  const syntheticUrl = input.url ?? `user_intent:${input.userId}:${slug(title)}`;
  const now = new Date().toISOString();

  const rawPayload = {
    category,
    source: "user_intent",
    origin: input.origin ?? "chat",
    search_query: title,
    note: input.note ?? null,
    date_hint: input.dateHint ?? null,
    kind: input.kind ?? null,
  } as unknown as Json;
  const reason = {
    summary: input.note?.trim() || `Owner asked for "${title}".`,
    category,
    source: "user_intent",
  } as unknown as Json;

  // Find-or-create: reuse an active row for the same ask, refreshed to user_intent.
  const { data: existing } = await supabase
    .from("radar_candidate_inbox")
    .select("id")
    .eq("user_id", input.userId)
    .in("status", ["new", "evaluated", "library", "held"])
    .ilike("title", title)
    .limit(1);
  const existingId = ((existing ?? []) as Array<{ id: string }>)[0]?.id;

  if (existingId) {
    await supabase
      .from("radar_candidate_inbox")
      .update({
        status: "new",
        score: USER_INTENT_SCORE,
        raw_payload: rawPayload,
        reason,
        url: syntheticUrl,
        entity_type: entityType,
        updated_at: now,
      })
      .eq("id", existingId)
      .eq("user_id", input.userId);
    return existingId;
  }

  const { data: inserted, error } = await supabase
    .from("radar_candidate_inbox")
    .insert({
      user_id: input.userId,
      title,
      description: input.note ?? null,
      url: syntheticUrl,
      entity_type: entityType,
      raw_payload: rawPayload,
      reason,
      status: "new",
      score: USER_INTENT_SCORE,
      updated_at: now,
    })
    .select("id")
    .single();
  if (error) throw new Error(`captureUserIntent insert failed: ${error.message}`);
  return (inserted as { id: string }).id;
}

/**
 * Capture an owner ask AND research/surface it now (responsive path for chat/
 * voice), then pre-build its plan page so it opens instantly. Returns the
 * candidate id and the conversion result.
 */
export async function captureAndSurfaceUserIntent(
  input: UserIntentInput,
): Promise<{ candidateId: string; result: CandidateConversionResult }> {
  const supabase = input.supabase ?? getSupabaseServiceClient();
  const candidateId = await captureUserIntent({ ...input, supabase });
  const result = await researchUserIntent(input.userId, candidateId, supabase);
  return { candidateId, result };
}

/**
 * Research an already-captured user-intent candidate and pre-build its plan.
 * Safe to run in the background (e.g. Next `after()`) — uses the service client
 * by default so it survives the originating request closing.
 */
export async function researchUserIntent(
  userId: string,
  candidateId: string,
  supabase?: SupabaseClient,
): Promise<CandidateConversionResult> {
  const sb = supabase ?? getSupabaseServiceClient();
  const result = await convertSingleCandidate({ userId, candidateId, supabase: sb });
  // Pre-build the full plan page for whatever just surfaced as shown.
  try {
    await preBuildPlansForShownItems(userId, sb, { maxItems: 2 });
  } catch (err) {
    result.errors.push(`plan pre-build failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  return result;
}

function resolveCategory(input: UserIntentInput): RadarCategory {
  return (
    normalizeRadarCategory(input.category) ??
    normalizeRadarCategory(input.kind) ??
    normalizeRadarCategory([input.title, input.note].filter(Boolean).join(" ")) ??
    "places"
  );
}

function entityTypeFor(category: RadarCategory, kind: UserIntentInput["kind"]): string {
  if (kind === "event" || category === "events") return "event";
  if (kind === "style" || category === "style") return "opportunity";
  return "place";
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
