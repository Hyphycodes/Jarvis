import type { Json } from "@/lib/types/database";

/** Experience Memory Engine — the taste signal a recorded experience produces.
 *  Pure + deterministic so curation/council can read a compact, reusable signal.
 *  (Kept out of the "use server" action so it's unit-testable.) */

export type ExperienceRating = "loved" | "good" | "meh" | "not_for_me";

/** Conviction weight per rating. Loved is strongest positive; not_for_me is a
 *  strong avoid (a clear "no" carries more signal than a lukewarm "meh"). */
export const RATING_STRENGTH: Record<ExperienceRating, number> = {
  loved: 1.0,
  good: 0.6,
  meh: 0.4,
  not_for_me: 0.85,
};

export type TasteSignalInput = {
  rating: ExperienceRating;
  wouldReturn?: boolean | null;
  spendAmount?: number | null;
  companions?: string[] | null;
  notes?: string | null;
};

export type TasteSignalContext = {
  lane: string | null;
  venueName: string | null;
  neighborhood: string | null;
  subType: string | null;
  cuisine: string | null;
  tags: string[];
};

export function tasteValence(rating: ExperienceRating): "positive" | "negative" {
  return rating === "loved" || rating === "good" ? "positive" : "negative";
}

/** Compact, reusable signal: loved/good reinforce; meh/not_for_me are avoid
 *  signals. Carries the dimensions curation can match on (lane/neighborhood/
 *  sub_type/cuisine/tags) plus spend/companions/notes for richer context. */
export function buildExperienceTasteSignal(
  input: TasteSignalInput,
  ctx: TasteSignalContext,
): Json {
  return {
    valence: tasteValence(input.rating),
    strength: RATING_STRENGTH[input.rating],
    rating: input.rating,
    would_return: input.wouldReturn ?? null,
    venue: ctx.venueName,
    lane: ctx.lane,
    neighborhood: ctx.neighborhood,
    sub_type: ctx.subType,
    cuisine: ctx.cuisine,
    tags: ctx.tags,
    spend: input.spendAmount ?? null,
    companions: input.companions ?? [],
    notes_summary: input.notes ? input.notes.slice(0, 280) : null,
    recorded_at: new Date().toISOString(),
  } as Json;
}
