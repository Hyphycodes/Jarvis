/**
 * Taste Strategist — decides what Jarvis should be curious about RIGHT NOW.
 *
 * Runs BEFORE source gathering. Reads the Interest Graph + context and
 * generates exploration lanes (aligned / adjacent / wildcard) that the
 * Curiosity Engine turns into source instructions.
 *
 * The strategist does NOT recommend items. It tells Jarvis what kind of
 * signal to go looking for. Returning zero lanes is valid when nothing
 * useful should be explored.
 */

import "server-only";
import { z } from "zod";

import { hasAnthropic } from "@/lib/ai/anthropic";
import { generateStructured } from "@/lib/ai/structured";
import type { BrainContextPacket } from "@/lib/brain/types";
import type { Interest, InterestGraph } from "@/lib/brain/interests";
import {
  listActiveInterests,
  listDormantInterests,
  listTopLevelInterests,
  summarizeInterestGraph,
} from "@/lib/brain/interests";
import {
  RADAR_ACTIVE_ITEM_LIMIT,
  RADAR_IDEAL_ACTIVE_ITEM_LIMIT,
  HOLDING_ITEM_LIMIT,
} from "@/lib/brain/constants";

// ── Lane shape ───────────────────────────────────────────────────────────────

export const explorationLaneSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  mode: z.enum(["aligned", "adjacent", "wildcard"]),
  interest_area: z.string().min(1),
  subinterests: z.array(z.string()).default([]),
  why_it_fits: z.string().min(1),
  why_now: z.string().min(1),
  source_strategy: z.array(z.string()).default([]),
  query_ideas: z.array(z.string()).min(1).max(6),
  preferred_domains: z.array(z.string()).optional(),
  excluded_domains: z.array(z.string()).optional(),
  suggested_destination: z.enum(["radar", "holding", "discovered", "north"]),
  urgency: z.enum(["low", "medium", "high"]),
  effort_level: z.enum(["low", "medium", "high"]),
  spending_posture: z.enum(["free", "low", "paid", "high"]),
  confidence: z.number().min(0).max(1),
});

export type ExplorationLane = z.infer<typeof explorationLaneSchema>;

export const strategistOutputSchema = z.object({
  lanes: z.array(explorationLaneSchema).max(6),
  notes: z.string().default(""),
});

export type StrategistOutput = z.infer<typeof strategistOutputSchema>;

export type StrategistInput = {
  context: BrainContextPacket;
  graph: InterestGraph;
  /** Current Active Radar size. Helps the strategist stay quiet when full. */
  activeRadarCount: number;
  /** Current Holding count. */
  holdingCount: number;
};

// ── Hard caps on lane mix ────────────────────────────────────────────────────

export const STRATEGIST_LIMITS = {
  totalMax: 6,
  alignedMax: 3,
  adjacentMax: 2,
  wildcardMax: 1,
};

// ── Prompt ───────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Jarvis's TASTE STRATEGIST. You decide what Jarvis should be
curious about right now — before any external API is called.

CORE PRINCIPLES
- Jarvis is not a feed. Do not always search the same categories. Do not always search
  restaurants. Think in intersections, not categories.
- Build on the founder's taste, but do not trap him in it. Adjacent ideas that sharpen
  his life, style, business, health, or creativity are part of the job.
- Preserve a masculine, refined, cinematic, grounded taste.
- Avoid: basic tourist/clickbait/listicle energy, random novelty, shopping noise,
  constant paid recommendations.
- Workday weeknights (Mon–Thu) are limited energy. The founder leaves for work around
  6:20 AM, leaves Schaumburg around 3:30 PM, is usually home around 4:30 PM. Workday
  suggestions should be practical or lightweight unless very strong.
- Strong but non-urgent ideas → suggested_destination: "holding".
- Long-term / direction-oriented ideas → "north".
- High-confidence and timely → "radar".
- Wildcards must still make sense — never random.
- Zero lanes is acceptable if nothing useful should be explored.

LANE MIX (defaults; you may return fewer)
- 2–3 ALIGNED lanes: direct extensions of active interests
- 1–2 ADJACENT lanes: stretch interests that pair with the founder's taste
- 0–1 WILDCARD lane: a genuine surprise that still respects taste
- Total max ${STRATEGIST_LIMITS.totalMax} lanes

SOURCE STRATEGY (advisory — the Curiosity Engine routes lanes to real adapters)
- "localRadar" — best for cultural/lifestyle web research with strong domains
- "googlePlaces" — only for clear physical places (restaurants, bars, stores)
- "ticketmaster" — only for ticketed events with clear timing
- "tavily" / "brave" — broader web research (brave is fallback)
- "serpapi" — products / shopping ONLY when the lane is explicitly product/style/watch/gear

GUARDRAILS
- Avoid speculative searches in dormant interests unless emerging signal is strong.
- Do not propose product/shopping lanes unless the lane is genuinely about that
  (no random product noise).
- Each lane MUST have 1–6 query_ideas that are specific (not "good restaurants Chicago").

OUTPUT
Strict JSON matching the StrategistOutput schema:
{
  "lanes": [ExplorationLane, ...],
  "notes": "brief reasoning for the lane mix (1-2 sentences)"
}`;

// ── Main entry ───────────────────────────────────────────────────────────────

export async function runTasteStrategist(
  input: StrategistInput,
): Promise<{ output: StrategistOutput; fallbackUsed: boolean; reason?: string }> {
  // Short-circuit: if Radar + Holding are already overflowing, don't explore.
  const inventoryFull =
    input.activeRadarCount >= RADAR_ACTIVE_ITEM_LIMIT &&
    input.holdingCount >= HOLDING_ITEM_LIMIT;
  if (inventoryFull) {
    return {
      output: { lanes: [], notes: "Active Radar and Holding both at capacity." },
      fallbackUsed: false,
      reason: "inventory_full",
    };
  }

  if (!hasAnthropic()) {
    return {
      output: deterministicLanes(input),
      fallbackUsed: true,
      reason: "no_anthropic_key",
    };
  }

  try {
    const prompt = renderPrompt(input);
    const raw = await generateStructured<unknown>({
      system: SYSTEM_PROMPT,
      prompt,
      schemaName: "StrategistOutput",
      temperature: 0.4,
    });
    const parsed = strategistOutputSchema.safeParse(raw);
    if (!parsed.success) {
      console.error("[strategist] schema mismatch", parsed.error.message);
      return {
        output: deterministicLanes(input),
        fallbackUsed: true,
        reason: "schema_invalid",
      };
    }
    const trimmed = enforceLaneMix(parsed.data);
    return { output: trimmed, fallbackUsed: false };
  } catch (error) {
    console.error("[strategist] failed", error);
    return {
      output: deterministicLanes(input),
      fallbackUsed: true,
      reason: "claude_error",
    };
  }
}

// ── Lane mix enforcement (code-side) ────────────────────────────────────────

function enforceLaneMix(output: StrategistOutput): StrategistOutput {
  const buckets: Record<ExplorationLane["mode"], ExplorationLane[]> = {
    aligned: [],
    adjacent: [],
    wildcard: [],
  };
  for (const lane of output.lanes) {
    buckets[lane.mode].push(lane);
  }
  buckets.aligned = buckets.aligned.slice(0, STRATEGIST_LIMITS.alignedMax);
  buckets.adjacent = buckets.adjacent.slice(0, STRATEGIST_LIMITS.adjacentMax);
  buckets.wildcard = buckets.wildcard.slice(0, STRATEGIST_LIMITS.wildcardMax);

  const merged = [...buckets.aligned, ...buckets.adjacent, ...buckets.wildcard]
    .slice(0, STRATEGIST_LIMITS.totalMax);

  return { lanes: merged, notes: output.notes };
}

// ── Prompt rendering ─────────────────────────────────────────────────────────

function renderPrompt(input: StrategistInput): string {
  const { context, graph } = input;
  const now = new Date(context.now);
  const dayOfWeek = now.toLocaleDateString("en-US", { weekday: "long" });
  const isWeeknight = now.getDay() >= 1 && now.getDay() <= 4;
  const hour = now.getHours();

  const graphSummary = summarizeInterestGraph(graph, {
    maxSubinterestsPerArea: 5,
  });

  return JSON.stringify(
    {
      now: context.now,
      day_of_week: dayOfWeek,
      is_weeknight: isWeeknight,
      hour_local: hour,
      home: { city: context.homeCity, state: context.homeState },
      founder: {
        life_direction: context.founder.lifeDirection,
        current_focus: context.founder.currentFocus,
        vibe: context.founder.vibeKeywords,
        avoid: context.founder.avoidKeywords,
        dealbreakers: context.founder.dealbreakers,
        principles: context.founder.pinnedPrinciples,
      },
      schedule_hints: {
        leaves_for_work: "06:20",
        leaves_schaumburg: "15:30",
        home_by: "16:30",
        weeknight_energy: isWeeknight ? "limited" : "wider_aperture",
      },
      interest_graph: graphSummary,
      memory_summary: context.memory.slice(0, 10).map((m) => m.content),
      recent_actions: context.recentActions,
      active_radar_count: input.activeRadarCount,
      holding_count: input.holdingCount,
      ideal_active: RADAR_IDEAL_ACTIVE_ITEM_LIMIT,
      hard_active_cap: RADAR_ACTIVE_ITEM_LIMIT,
      hard_holding_cap: HOLDING_ITEM_LIMIT,
      weather: context.weather,
      active_plan: context.activePlan,
      instructions: [
        "Return 0–6 lanes. 0 is valid.",
        "Mix: aligned (2–3) + adjacent (1–2) + wildcard (0–1).",
        "Each lane needs 1–6 specific query_ideas — not 'restaurants Chicago'.",
        "Strong-but-not-urgent → suggested_destination: 'holding'.",
        "Long-term / direction → 'north'. Time-sensitive + high confidence → 'radar'.",
        "Do not propose product/shopping lanes unless the interest_area is product/style/watch/gear.",
      ],
    },
    null,
    2,
  );
}

// ── Deterministic fallback ──────────────────────────────────────────────────

/**
 * Pure deterministic lane builder. Used when Anthropic is missing or returns
 * invalid output. Picks top-weighted active interests + 1 dormant emerge +
 * 1 adjacent stretch.
 */
function deterministicLanes(input: StrategistInput): StrategistOutput {
  const active = listActiveInterests(input.graph)
    .filter((i) => !i.parentId)
    .sort((a, b) => b.weight - a.weight);
  const dormant = listDormantInterests(input.graph).filter((i) => !i.parentId);
  const tops = listTopLevelInterests(input.graph);

  const lanes: ExplorationLane[] = [];

  // 2 aligned lanes from the top of active
  for (const interest of active.slice(0, 2)) {
    lanes.push(laneFromInterest(interest, "aligned", input));
  }

  // 1 adjacent lane: pick the first adjacent of the first aligned area
  const firstActive = active[0];
  if (firstActive && firstActive.adjacent.length > 0) {
    const adjId = firstActive.adjacent[0];
    const adj = tops.find((t) => t.id === adjId);
    if (adj) lanes.push(laneFromInterest(adj, "adjacent", input));
  }

  // 1 wildcard: pick a dormant interest if any
  if (dormant.length > 0) {
    lanes.push(laneFromInterest(dormant[0], "wildcard", input));
  }

  return {
    lanes: lanes.slice(0, STRATEGIST_LIMITS.totalMax),
    notes: "Deterministic fallback (no Anthropic key or parse error).",
  };
}

function laneFromInterest(
  interest: Interest,
  mode: ExplorationLane["mode"],
  input: StrategistInput,
): ExplorationLane {
  const city = input.context.homeCity ?? "Chicago";
  const subLabels = interest.subinterests
    .map((id) => input.graph.byId[id]?.label)
    .filter((x): x is string => Boolean(x))
    .slice(0, 3);

  const queries: string[] = [];
  if (subLabels.length > 0) {
    queries.push(`${subLabels[0]} ${city}`);
    if (subLabels[1]) queries.push(`${subLabels[1]} ${city}`);
    if (mode === "wildcard") queries.push(`${interest.label} unexpected angle`);
  } else {
    queries.push(`${interest.label} ${city} 2025`);
  }

  const destination: ExplorationLane["suggested_destination"] =
    mode === "wildcard"
      ? "discovered"
      : interest.preferredDestinations[0] ?? "holding";

  const sourceStrategy = interest.relatedSources.length > 0
    ? interest.relatedSources.map(String)
    : ["localRadar", "tavily"];

  return {
    id: `seed:${interest.id}:${mode}`,
    title: `${interest.label} (${mode})`,
    mode,
    interest_area: interest.id,
    subinterests: interest.subinterests.slice(0, 4),
    why_it_fits: `Active interest in ${interest.label}.`,
    why_now: mode === "wildcard"
      ? "Periodic stretch — keep curiosity warm."
      : "Strong baseline weight in current Interest Graph.",
    source_strategy: sourceStrategy,
    query_ideas: queries.slice(0, 4),
    suggested_destination: destination,
    urgency: mode === "aligned" ? "medium" : "low",
    effort_level: interest.effortLevel,
    spending_posture: interest.spendingPosture,
    confidence: mode === "aligned" ? 0.7 : mode === "adjacent" ? 0.55 : 0.45,
  };
}
