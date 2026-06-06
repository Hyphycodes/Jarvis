import "server-only";

import { hasAnthropic } from "@/lib/ai/anthropic";
import { generateStructured } from "@/lib/ai/structured";
import type { BrainContextPacket } from "@/lib/brain/types";
import type { RadarCategory } from "@/lib/radar/category";

/**
 * Phase 2 Executive Council — the ONE cross-category pass. Category councils
 * judge each lane on its own terms; the Executive Council then compares the
 * lanes against each other and decides what deserves attention now. It does NOT
 * re-judge quality — it sequences and balances:
 *  - user-stated intent gets a strong boost (deterministic, not left to the LLM)
 *  - balance lanes (don't stack four dinners; fill empty lanes)
 *  - respect rhythm/weather (suppress high-effort moves on workday mornings)
 *  - urgency (dated events) escalates
 *  - low-data items stay held
 */

export type ExecutiveCandidate = {
  id: string;
  category: RadarCategory | string;
  title: string;
  /** Lane council score 0..1 (from scoreCategoryCouncil / decisionCouncil). */
  laneScore: number;
  /** True when the owner explicitly asked for this (source=user_intent). */
  userIntent?: boolean;
  /** ISO datetime for dated items (events), else undefined. */
  startsAt?: string;
  /** North pillar tags from materialize time. */
  pillarTags?: string[];
  /** One-line reason it surfaced, for the LLM to weigh. */
  reason?: string;
  /** Lane signals/flags surfaced by the category council. */
  signals?: string[];
  flags?: string[];
};

export type ExecutiveSurface = "today" | "radar" | "hold" | "archive";

export type ExecutiveDecision = {
  id: string;
  category: string;
  attentionRank: number; // 1 = most deserving of attention now
  surface: ExecutiveSurface;
  why_now: string;
  intentBoosted: boolean;
  pillarTags: string[];
};

type LlmRow = {
  id?: string;
  attention_rank?: number;
  surface?: string;
  why_now?: string;
};

const SYSTEM_PROMPT = `You are Jarvis's EXECUTIVE COUNCIL. Category specialists have already judged each candidate within its lane. Your only job is to compare ACROSS lanes and decide what deserves the owner's attention RIGHT NOW, and where each should surface.

You are sequencing and balancing, NOT re-judging quality. Principles:
- USER INTENT LEADS: anything the owner explicitly asked for outranks background discovery. (These are also force-boosted after you, so never bury them.)
- BALANCE THE WEEK: don't stack one lane (e.g. four dinners). Favor filling empty/under-represented lanes and a coherent mix.
- RHYTHM & WEATHER: suppress high-effort/outdoor moves that don't fit the day/weather; favor what fits the current week shape.
- URGENCY: dated events happening soon escalate; far-off or undated items can wait.
- NORTH BALANCE: lightly favor pillars that are underweight this week, without forcing it.

surface options:
- "today": time-sensitive or clearly the next action (dated soon, or a strong fit for right now). Use sparingly.
- "radar": worth surfacing in the discovery feed (most items).
- "hold": fine but not now (wrong time, lane already full).
- "archive": only if clearly stale/irrelevant.

Return strict JSON: { "ranked": [{ "id": string, "attention_rank": number, "surface": "today"|"radar"|"hold"|"archive", "why_now": string }] }
Rank every id you are given exactly once, attention_rank starting at 1 (most deserving). Keep why_now to one short clause.`;

export async function runExecutiveCouncil(input: {
  shortlist: ExecutiveCandidate[];
  brainContext?: BrainContextPacket;
  weekShape?: string | null;
}): Promise<ExecutiveDecision[]> {
  const shortlist = input.shortlist.filter((c) => c.id);
  if (shortlist.length === 0) return [];

  // Deterministic fallback ordering: user intent first, then lane score.
  const fallback = (): ExecutiveDecision[] =>
    [...shortlist]
      .sort((a, b) => Number(Boolean(b.userIntent)) - Number(Boolean(a.userIntent)) || b.laneScore - a.laneScore)
      .map((c, i) => ({
        id: c.id,
        category: String(c.category),
        attentionRank: i + 1,
        surface: defaultSurface(c),
        why_now: c.reason ?? "",
        intentBoosted: Boolean(c.userIntent),
        pillarTags: c.pillarTags ?? [],
      }));

  if (!hasAnthropic()) return fallback();

  try {
    const ctx = input.brainContext;
    const raw = await generateStructured<{ ranked?: LlmRow[] }>({
      system: SYSTEM_PROMPT,
      prompt: JSON.stringify(
        {
          now: ctx?.now ?? new Date().toISOString(),
          week_shape: input.weekShape ?? null,
          weather: ctx?.weather ?? null,
          weekly_rhythm: ctx?.weeklyRhythm ?? null,
          north_pillars: ctx?.northPillars ?? [],
          radar_composition: ctx?.lifeContext?.radarComposition ?? null,
          recent_activity_by_category: ctx?.lifeContext?.recentActivityByCategory ?? null,
          category_gaps: ctx?.lifeContext?.categoryGaps ?? [],
          candidates: shortlist.map((c) => ({
            id: c.id,
            category: c.category,
            title: c.title,
            lane_score: round2(c.laneScore),
            user_intent: Boolean(c.userIntent),
            starts_at: c.startsAt ?? null,
            pillar_tags: c.pillarTags ?? [],
            reason: c.reason ?? null,
            signals: c.signals ?? [],
            flags: c.flags ?? [],
          })),
          instruction: "Rank across lanes for attention now. Strict JSON only.",
        },
        null,
        2,
      ),
      schemaName: "ExecutiveCouncilRanking",
      temperature: 0.3,
      maxTokens: 1800,
    });

    const rows = Array.isArray(raw.ranked) ? raw.ranked : [];
    const byId = new Map<string, ExecutiveCandidate>(shortlist.map((c) => [c.id, c]));
    const decided: ExecutiveDecision[] = [];
    const seen = new Set<string>();

    for (const row of rows) {
      const id = typeof row.id === "string" ? row.id : "";
      const cand = byId.get(id);
      if (!cand || seen.has(id)) continue;
      seen.add(id);
      decided.push({
        id,
        category: String(cand.category),
        attentionRank: typeof row.attention_rank === "number" ? row.attention_rank : decided.length + 1,
        surface: normalizeSurface(row.surface) ?? defaultSurface(cand),
        why_now: typeof row.why_now === "string" && row.why_now.trim() ? row.why_now.trim() : (cand.reason ?? ""),
        intentBoosted: Boolean(cand.userIntent),
        pillarTags: cand.pillarTags ?? [],
      });
    }

    // Coverage: any candidate the LLM dropped gets appended by lane score.
    for (const c of shortlist) {
      if (seen.has(c.id)) continue;
      decided.push({
        id: c.id,
        category: String(c.category),
        attentionRank: decided.length + 1,
        surface: defaultSurface(c),
        why_now: c.reason ?? "",
        intentBoosted: Boolean(c.userIntent),
        pillarTags: c.pillarTags ?? [],
      });
    }

    return enforceIntentBoost(decided, byId);
  } catch (err) {
    console.error("[executiveCouncil] failed", err instanceof Error ? err.message : err);
    return fallback();
  }
}

/** User-intent items are force-pulled to the front regardless of LLM ordering,
 *  then ranks are renumbered. The owner's explicit ask never gets buried. */
function enforceIntentBoost(
  decided: ExecutiveDecision[],
  byId: Map<string, ExecutiveCandidate>,
): ExecutiveDecision[] {
  const intent = decided.filter((d) => byId.get(d.id)?.userIntent);
  const rest = decided.filter((d) => !byId.get(d.id)?.userIntent);
  const ordered = [
    ...intent.sort((a, b) => a.attentionRank - b.attentionRank),
    ...rest.sort((a, b) => a.attentionRank - b.attentionRank),
  ];
  return ordered.map((d, i) => ({
    ...d,
    attentionRank: i + 1,
    // A user-intent item should never be held/archived by the executive pass.
    surface: d.intentBoosted && (d.surface === "hold" || d.surface === "archive") ? "radar" : d.surface,
  }));
}

function defaultSurface(c: ExecutiveCandidate): ExecutiveSurface {
  if (c.startsAt) {
    const days = (new Date(c.startsAt).getTime() - Date.now()) / 86_400_000;
    if (days >= 0 && days <= 2) return "today";
  }
  return "radar";
}

function normalizeSurface(v: unknown): ExecutiveSurface | null {
  return v === "today" || v === "radar" || v === "hold" || v === "archive" ? v : null;
}

function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}
