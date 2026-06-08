import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { readOperatingPreferences } from "@/lib/operating/readOperatingPreferences";
import { pillarsForItem } from "@/lib/radar/engine/pillars";
import { runFindsCouncil, type FindCouncilInput } from "@/lib/radar/engine/finds/council";
import {
  assessFindTruth,
  assessFindBudget,
  assessFindUtility,
  type AssessableFind,
} from "@/lib/radar/engine/finds/assess";
import type { Json } from "@/lib/types/database";

/**
 * Finds lane engine — the curation BRAIN over the existing Finds (per
 * jarvis-finds-engine-brain-tree.md). Finds is SPECIAL: it KEEPS the Product
 * Researcher + ProductDossier + surfaced_items payload + /find/[id]. This engine
 * does NOT create a warehouse or re-render finds into a plan template — it scores
 * the existing finds (Truth/Budget/Utility + council), writes a decision note +
 * North pillars, and enforces the budget discipline (fantasy luxury → reserve).
 *
 * It never touches saved/planned/passed/purchased rows, and never adds plan/event
 * fields to a find (UI protection).
 */

const COUNCIL_FINALISTS = 12;
const LOCKED_STATUSES = ["saved", "planned", "passed", "completed", "purchased"];

export type FindsEngineResult = {
  scored: number;
  judged: number;
  demotedToReserve: number;
  errors: string[];
};

type FindRow = {
  id: string;
  status: string;
  destination: string | null;
  source: string | null;
  score: number | null;
  payload: unknown;
};

export async function runFindsEngine(input: {
  userId: string;
  supabase?: SupabaseClient;
}): Promise<FindsEngineResult> {
  const supabase = input.supabase ?? getSupabaseServiceClient();
  const result: FindsEngineResult = { scored: 0, judged: 0, demotedToReserve: 0, errors: [] };

  const { data, error } = await supabase
    .from("surfaced_items")
    .select("id, status, destination, source, score, payload")
    .eq("user_id", input.userId)
    .eq("category", "finds")
    .in("status", ["shown", "discovered", "opened"])
    .limit(150);
  if (error || !data) {
    if (error) result.errors.push(`read finds: ${error.message}`);
    return result;
  }
  const rows = (data as FindRow[]).filter((r) => isRecord(r.payload) && isRecord((r.payload as Record<string, unknown>).finds));

  const prefs = await readOperatingPreferences(supabase, input.userId).catch(() => null);
  const now = new Date().toISOString();

  // 1) Deterministic assessments per find → score + budget gate.
  const scored: Array<{ row: FindRow; find: AssessableFind; finalScore: number; budgetTier: string; requiresRequest: boolean }> = [];
  for (const row of rows) {
    const payload = row.payload as Record<string, unknown>;
    const dossier = payload.finds as Record<string, unknown>;
    const best = isRecord(dossier.best_pick) ? dossier.best_pick : {};
    const userRequested = row.source === "user_intent";
    const f: AssessableFind = {
      title: str(best.name) ?? str(dossier.mission_title),
      brand: str(best.brand),
      retailer: str(best.retailer),
      price: str(best.price),
      product_url: str(best.product_url),
      image_url: str(best.image_url),
      dossier_budget_tier: str(dossier.budget_tier),
      value_for_income: num(dossier.value_for_income),
      verdict_strength: num(dossier.verdict_strength),
      research_state: str(dossier.research_state),
      userRequested,
    };
    const truth = assessFindTruth(f);
    const budget = assessFindBudget(f, {
      premiumThreshold: prefs?.premiumThreshold ?? null,
      aspirationalFrequency: prefs?.aspirationalFrequency ?? null,
      findsComfort: prefs?.findsComfort ?? null,
    });
    const utility = assessFindUtility(f);
    const finalScore = clamp01(0.4 * truth.product_confidence + 0.35 * utility.utility_score + 0.25 * clamp01(f.verdict_strength ?? 0.5));

    const nextPayload: Record<string, unknown> = {
      ...payload,
      finds_engine: {
        truth_assessment: truth,
        budget_assessment: budget,
        utility_assessment: utility,
        final_score: finalScore,
        scored_at: now,
      },
      pillar_tags: pillarsForItem({ category: "finds", lane: "finds", tags: arr(payload.tags), title: f.title ?? "" }),
    };
    const { error: upErr } = await supabase
      .from("surfaced_items")
      .update({ score: finalScore, payload: nextPayload as Json })
      .eq("id", row.id)
      .eq("user_id", input.userId);
    if (!upErr) result.scored += 1;

    // Budget gate: fantasy luxury / aspirational-held background finds → reserve
    // (never delete; never touch locked or user-requested).
    if (!userRequested && budget.requires_user_request && row.status === "shown") {
      const { error: dErr } = await supabase
        .from("surfaced_items")
        .update({ destination: "holding", status: "discovered" })
        .eq("id", row.id)
        .eq("user_id", input.userId)
        .not("status", "in", `(${LOCKED_STATUSES.join(",")})`);
      if (!dErr) result.demotedToReserve += 1;
    }

    scored.push({ row, find: f, finalScore, budgetTier: budget.budget_tier, requiresRequest: budget.requires_user_request });
  }

  // 2) Council (LLM) on the strongest finalists → decision note + refined score.
  const finalists = scored
    .filter((s) => !s.requiresRequest)
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, COUNCIL_FINALISTS);
  if (finalists.length > 0) {
    const councilInput: FindCouncilInput[] = finalists.map((s) => ({
      id: s.row.id,
      title: s.find.title ?? "Find",
      brand: s.find.brand,
      price: s.find.price,
      source_brain: str((s.row.payload as Record<string, unknown>).source_brain),
      budget_tier: s.budgetTier,
    }));
    try {
      const verdicts = await runFindsCouncil({ userId: input.userId, finds: councilInput, supabase });
      for (const s of finalists) {
        const v = verdicts.get(s.row.id);
        if (!v) continue;
        const payload = isRecord(s.row.payload) ? (s.row.payload as Record<string, unknown>) : {};
        const engine = isRecord(payload.finds_engine) ? (payload.finds_engine as Record<string, unknown>) : {};
        const nextPayload = { ...payload, finds_engine: { ...engine, final_score: v.final_score, decision_note: v.decision_note } };
        // Devil-killed clear junk (background only) → reserve, not delete.
        const demote = v.devil_kill && s.row.source !== "user_intent" && s.row.status === "shown";
        const patch: Record<string, unknown> = { score: v.final_score, payload: nextPayload as Json };
        if (demote) {
          patch.destination = "holding";
          patch.status = "discovered";
        }
        const q = supabase.from("surfaced_items").update(patch).eq("id", s.row.id).eq("user_id", input.userId);
        const { error: cErr } = await (demote ? q.not("status", "in", `(${LOCKED_STATUSES.join(",")})`) : q);
        if (cErr) result.errors.push(`council apply ${s.row.id}: ${cErr.message}`);
        else {
          result.judged += 1;
          if (demote) result.demotedToReserve += 1;
        }
      }
    } catch (err) {
      result.errors.push(`council: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function arr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
}
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
