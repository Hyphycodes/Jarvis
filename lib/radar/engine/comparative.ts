import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { hasAnthropic } from "@/lib/ai/anthropic";
import { generateStructured } from "@/lib/ai/structured";
import { buildBrainContext } from "@/lib/brain/context";
import { buildAgentTasteBlock, type AgentTaste } from "@/lib/brain/categoryAgents";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { DINING_SUBLIBRARIES } from "@/lib/radar/engine/sources";
import { logRejections } from "@/lib/radar/engine/rejections";

/** Stage 7 — comparative head-to-head within each sub-library.
 *  Ranked survivors insert into category_best; losers → rejected/comparative_cut. */

// Top N per sub-library promoted to category_best. Generous on purpose: this
// feeds the bench (target 30+/lane) and the editor does the final shelf trim.
// Keeping only ~7 here would starve the bench AND permanently reject good
// enriched venues each cycle. The editor (≤30) + bench displacement curate down.
export const COMPARATIVE_KEEP = 15;

export type ComparativeResult = {
  subLibrary: string;
  considered: number;
  promoted: number; // inserted into category_best
  cut: number;
  errors: string[];
};

type JudgedRow = {
  id: string;
  name: string;
  sub_type: string | null;
  neighborhood: string | null;
  pre_score: number | null;
  final_score: number | null;
  council: Record<string, unknown> | null;
  google_place_id: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  price_level: string | null;
  hours: string | null;
  reservation_required: boolean | null;
  cuisine: string | null;
  photo_urls: unknown;
};

/** Bundle the council verdict + Google enrichment into the jsonb that rides
 *  forward to category_best → radar_library → the surfaced_items mirror. */
function buildEnrichmentData(row: JudgedRow): Record<string, unknown> {
  const photos = Array.isArray(row.photo_urls) ? (row.photo_urls as unknown[]) : [];
  const imageUrl = typeof photos[0] === "string" ? (photos[0] as string) : null;
  return {
    council: row.council ?? null,
    image_url: imageUrl,
    google_place_id: row.google_place_id,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    price_level: row.price_level,
    hours: row.hours,
    reservation_required: row.reservation_required,
    cuisine: row.cuisine,
  };
}

type RankEntry = {
  i: number;
  rank: number;
  rationale?: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export async function comparativeSubLibrary(input: {
  userId: string;
  subLibrary: string;
  supabase?: SupabaseClient;
  keep?: number;
}): Promise<ComparativeResult> {
  const config = DINING_SUBLIBRARIES[input.subLibrary];
  const result: ComparativeResult = {
    subLibrary: input.subLibrary,
    considered: 0,
    promoted: 0,
    cut: 0,
    errors: [],
  };
  if (!config) {
    result.errors.push(`Unknown sub-library: ${input.subLibrary}`);
    return result;
  }
  if (!hasAnthropic()) {
    result.errors.push("ANTHROPIC_API_KEY not set — comparative skipped");
    return result;
  }
  const supabase = input.supabase ?? getSupabaseServiceClient();
  const keep = input.keep ?? COMPARATIVE_KEEP;

  const { data, error } = await supabase
    .from(config.subLibrary)
    .select("id, name, sub_type, neighborhood, pre_score, final_score, council, google_place_id, address, lat, lng, price_level, hours, reservation_required, cuisine, photo_urls")
    .eq("user_id", input.userId)
    .eq("status", "judged")
    .order("final_score", { ascending: false, nullsFirst: false });
  if (error) {
    result.errors.push(`read judged: ${error.message}`);
    return result;
  }
  // Only promote rows that have been deep-enriched (have a google_place_id), so
  // the shelf is image-complete. Un-enriched judged rows stay judged and get
  // picked up by a later cycle's enrich, then promote — nothing is stranded.
  const rows = ((data ?? []) as JudgedRow[]).filter((r) => Boolean(r.google_place_id));
  result.considered = rows.length;
  if (rows.length === 0) return result;

  // If ≤ keep items, skip the LLM round and promote all directly.
  let rankings: RankEntry[];
  if (rows.length <= keep) {
    rankings = rows.map((_, i) => ({ i, rank: i + 1 }));
  } else {
    const brain = await buildBrainContext({ userId: input.userId, includeWeather: false, supabase });
    const taste: AgentTaste = {
      displayName: brain.founder?.displayName ?? null,
      city: brain.homeCity?.trim() || "Chicago",
      lifeDirection: brain.founder?.lifeDirection ?? null,
      currentFocus: brain.founder?.currentFocus ?? null,
      vibeKeywords: brain.founder?.vibeKeywords ?? [],
      avoidKeywords: brain.founder?.avoidKeywords ?? [],
      dealbreakers: brain.founder?.dealbreakers ?? [],
      pinnedPrinciples: brain.founder?.pinnedPrinciples ?? [],
      memories: (brain.memory ?? []).map((m) => ({ content: m.content, kind: m.kind })),
      northTags: brain.northTags ?? [],
    };
    try {
      rankings = await runComparative(config.subLibrary, config.brief, taste, rows);
    } catch (err) {
      result.errors.push(`comparative LLM: ${err instanceof Error ? err.message : String(err)}`);
      return result;
    }
  }

  // Sort by rank ascending; top `keep` are winners.
  rankings.sort((a, b) => a.rank - b.rank);
  const winners = new Set(rankings.slice(0, keep).map((r) => r.i));
  const rankMap = new Map(rankings.map((r) => [r.i, r]));

  const now = new Date().toISOString();
  const cutIds: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const entry = rankMap.get(i);
    const isWinner = winners.has(i);

    if (isWinner) {
      // Insert into category_best
      const { error: insErr } = await supabase.from("category_best").insert({
        user_id: input.userId,
        lane: "dining",
        source_sub_library: config.subLibrary,
        external_id: row.id, // sub-library row id as the dedup key here
        name: row.name,
        sub_type: row.sub_type,
        neighborhood: row.neighborhood,
        final_score: row.final_score,
        comparative_rank: entry?.rank ?? i + 1,
        enrichment_data: buildEnrichmentData(row),
        promoted_at: now,
      });
      if (insErr) {
        // Unique violation = already in category_best, just update rank
        await supabase
          .from("category_best")
          .update({ comparative_rank: entry?.rank ?? i + 1 })
          .eq("user_id", input.userId)
          .eq("external_id", row.id);
      }
      // Mark sub-library row promoted
      await supabase
        .from(config.subLibrary)
        .update({ status: "promoted", last_seen_at: now })
        .eq("id", row.id)
        .eq("user_id", input.userId);
      result.promoted += 1;
    } else {
      // Rejected by comparative round
      await supabase
        .from(config.subLibrary)
        .update({ status: "rejected", rejection_stage: "comparative", rejection_reason: "comparative_cut" })
        .eq("id", row.id)
        .eq("user_id", input.userId);
      cutIds.push(row.id);
      result.cut += 1;
    }
  }

  if (cutIds.length > 0) {
    await logRejections(supabase, {
      userId: input.userId,
      subLibrary: config.subLibrary,
      stage: "comparative",
      reason: "comparative_cut",
      entries: cutIds.map((id) => ({ candidateId: id })),
    });
  }
  return result;
}

export async function comparativeDining(input: {
  userId: string;
  supabase?: SupabaseClient;
  keep?: number;
}): Promise<ComparativeResult[]> {
  const supabase = input.supabase ?? getSupabaseServiceClient();
  const out: ComparativeResult[] = [];
  for (const subLibrary of Object.keys(DINING_SUBLIBRARIES)) {
    out.push(await comparativeSubLibrary({ userId: input.userId, subLibrary, supabase, keep: input.keep }));
  }
  return out;
}

async function runComparative(
  subLibrary: string,
  brief: string,
  taste: AgentTaste,
  rows: JudgedRow[],
): Promise<RankEntry[]> {
  const system = [
    `You are the COMPARATIVE EDITOR for the "${subLibrary}" sub-library.`,
    "Each item has already passed the specialist council (authenticity + Jerry-fit + devil's advocate).",
    "Your job: rank them head-to-head as a coherent shelf — not just highest score wins.",
    "Ask: which set, taken together, gives Jerry the richest, most varied, least redundant experience?",
    "Penalize sub_type duplicates (e.g. two identical cocktail bars) and neighborhood clustering (too many Logan Square picks when better options exist elsewhere).",
    brief,
  ].join("\n");

  const list = rows
    .map(
      (r, i) =>
        `${i}. ${r.name}${r.sub_type ? ` (${r.sub_type})` : ""}${r.neighborhood ? ` — ${r.neighborhood}` : ""} | score=${(r.final_score ?? 0).toFixed(2)} | ${(r.council as Record<string, unknown>)?.verdict ?? ""}`,
    )
    .join("\n");

  const prompt = [
    "Jerry's taste:",
    buildAgentTasteBlock(taste),
    "",
    `Finalists for comparative ranking (${rows.length} items — rank ALL of them):`,
    list,
    "",
    "Return strict JSON with every index ranked (rank 1 = best):",
    `{ "rankings": [{ "i": number, "rank": number, "rationale": string }] }`,
  ].join("\n");

  const raw = await generateStructured<unknown>({
    system,
    prompt,
    schemaName: `comparative_${subLibrary}`,
    temperature: 0.2,
    maxTokens: 2048,
  });

  const rankings: RankEntry[] = [];
  const list2 = isRecord(raw) && Array.isArray(raw.rankings) ? raw.rankings : [];
  for (const entry of list2) {
    if (!isRecord(entry) || typeof entry.i !== "number") continue;
    rankings.push({
      i: entry.i,
      rank: typeof entry.rank === "number" && entry.rank > 0 ? entry.rank : 999,
      rationale: typeof entry.rationale === "string" ? entry.rationale : undefined,
    });
  }
  // Fallback: any index missing from LLM response → append at the end
  const seen = new Set(rankings.map((r) => r.i));
  for (let i = 0; i < rows.length; i++) {
    if (!seen.has(i)) rankings.push({ i, rank: 999 + i });
  }
  return rankings;
}
