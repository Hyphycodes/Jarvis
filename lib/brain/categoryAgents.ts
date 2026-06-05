import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { hasAnthropic } from "@/lib/ai/anthropic";
import { generateStructured } from "@/lib/ai/structured";
import { buildBrainContext } from "@/lib/brain/context";
import { upsertCandidateInboxItem } from "@/lib/radar/candidateInbox";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { RADAR_CATEGORIES, type RadarCategory } from "@/lib/radar/category";
import type { Json } from "@/lib/types/database";

/**
 * Six category agents + synthesis (Prompt 2C, Task 5).
 *
 * Replaces the single general-purpose Scout with six focused agents — one per
 * canonical category — each with its own research posture and judgment frame.
 * They run in parallel (total wall-clock ≈ one agent's time). A seventh
 * synthesis pass reads all six plus the week's shape and orders what's "right
 * for right now" before the candidates enter the existing Researcher → Decision
 * Council → living-5 pipeline. Synthesis never overrides the gate — it reorders
 * the queue; the Decision Council still decides what surfaces.
 *
 * Taste is pulled fresh each run from founder_profile / memory / north and
 * injected — never hardcoded — so it stays current as the profile evolves.
 */

export type CategoryAgentCandidate = {
  name: string;
  relevance_brief: string;
  search_query?: string;
  url?: string;
  neighborhood?: string;
};

export type CategoryAgentOutput = {
  category: RadarCategory;
  candidates: CategoryAgentCandidate[];
  nothing_this_week: boolean;
  reason: string;
  /** True when the category is under-5 and Scout should search harder next run. */
  gap: boolean;
};

export type WeekContext = {
  isoDate: string;
  dayName: string;
  timeOfDay: "morning" | "afternoon" | "evening" | "overnight";
  city: string;
  year: number;
};

export type AgentTaste = {
  displayName?: string | null;
  city: string;
  lifeDirection?: string | null;
  currentFocus?: string | null;
  vibeKeywords: string[];
  avoidKeywords: string[];
  dealbreakers: string[];
  pinnedPrinciples: string[];
  memories: Array<{ content: string; kind: string }>;
  northTags: string[];
};

export type SynthesisResult = {
  ranked: Array<{ category: RadarCategory; name: string; rank: number; why_now: string }>;
  week_shape: string;
  gaps: RadarCategory[];
};

// ── Versioned agent briefs (the highest-leverage prompts in the system) ───────

export const CATEGORY_AGENT_BRIEFS: Record<RadarCategory, string> = {
  moves: `You are Jerry's MOVES agent. You think like a coach who knows his patterns. MOVES are active, physical things to DO — a hike, golf, a workout with soul, a court run. You know his rhythm: Sunday reset (steaks, a cigar with his dad), golf when the weather cooperates. You avoid performative fitness, group classes with no soul, anything that feels like a workout staged for Instagram.
Before searching, ask two questions: (1) Is this even a MOVE week — given his energy, recent activity, weather, and schedule? (2) If yes, what's the right physical challenge — not too easy, not a production? If signals say rest, return nothing_this_week=true with a reason. An empty Moves week is correct. Never pad.`,
  events: `You are Jerry's EVENTS agent. You think with urgency and taste fused. EVENTS are ticketed, time-bound happenings in the next ~10 days — concerts, Sox games, a wine tasting that's the right one (not just any one). You know his music lineage: classic soul, jazz, vinyl-led rooms. Timeliness is first-class — a great event three weeks out matters less than the same event three days out. Always ask: is the window closing on anything worth flagging now? If nothing real fits the window, return nothing_this_week=true.`,
  culture: `You are Jerry's CULTURE agent. You think slowly and curiously. CULTURE is drop-in, ongoing, unticketed — exhibits, gallery openings, architecture shows, the Fine Arts Building kind of thing. You know his growth edges: jazz lineage, architecture, craftsmanship traditions, opera. You are not hunting what's hot — you watch for what's quietly worth being in. Ask: is there something in the city right now that would expand him, not just entertain him? If not, return nothing_this_week=true rather than surfacing filler.`,
  dining: `You are Jerry's DINING agent. You think like someone who knows his full rotation and his rotation philosophy — he rotates away from places intentionally, even ones he loves. DINING is restaurants, bars, lounges. You know his taste cold: craftsmanship-oriented cooking, natural wine, quiet rooms with weight, service that attends instead of performs. Track what's worth returning to, what's genuinely new, what fits the energy of the coming days. Ask: is there a dining move this week, and why does it matter right now specifically? If nothing clears the bar, return nothing_this_week=true.`,
  places: `You are Jerry's PLACES agent. You think like a city insider with taste. PLACES are atmosphere spots that are NOT food — a cigar lounge, a hidden bar, a view, a park bench worth knowing, a shop with weight. You know his geometry (Logan Square base, Gold Coast drift, Lincoln Park mornings, Fulton Market) and his late-night patterns (Gold Coast Triangle, Maxwell-type rooms). You are building a curated map of places worth having in rotation — a set he can move to naturally, not a list of options. If nothing real is worth adding, return nothing_this_week=true.`,
  style: `You are Jerry's STYLE agent. You think like a buyer, not a scout. STYLE is products to acquire — drops, a watch release, the right overshirt, even socks he actually needs. Your research is market-facing: what came out, what's worth knowing before everyone else, what's worth the money given how he spends (with intention, not driven by price). Sources are menswear drops, watch releases, lifestyle product launches, curated retail — never mass market. Candidates are products, not places. If nothing is genuinely worth flagging, return nothing_this_week=true.`,
};

// ── Pure helpers (unit-tested) ────────────────────────────────────────────────

export function buildWeekContext(now: Date, city: string): WeekContext {
  const dayName = new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(now);
  const hour = now.getHours();
  const timeOfDay =
    hour < 5 ? "overnight" : hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  return { isoDate: now.toISOString(), dayName, timeOfDay, city, year: now.getFullYear() };
}

export function buildAgentTasteBlock(taste: AgentTaste): string {
  const lines: string[] = [];
  lines.push(`Home base: ${taste.city}.`);
  if (taste.lifeDirection) lines.push(`Life direction: ${taste.lifeDirection}.`);
  if (taste.currentFocus) lines.push(`Current focus: ${taste.currentFocus}.`);
  if (taste.vibeKeywords.length) lines.push(`Vibe he leans into: ${taste.vibeKeywords.join(", ")}.`);
  if (taste.avoidKeywords.length) lines.push(`Avoid: ${taste.avoidKeywords.join(", ")}.`);
  if (taste.dealbreakers.length) lines.push(`Dealbreakers (never surface): ${taste.dealbreakers.join(", ")}.`);
  if (taste.pinnedPrinciples.length) lines.push(`Pinned principles: ${taste.pinnedPrinciples.join(" · ")}.`);
  if (taste.northTags.length) lines.push(`North pillars/themes: ${taste.northTags.slice(0, 10).join(", ")}.`);
  if (taste.memories.length) {
    lines.push("Known preferences (from memory):");
    for (const m of taste.memories.slice(0, 12)) lines.push(`  - [${m.kind}] ${m.content}`);
  }
  return lines.join("\n");
}

/** Defensively coerce a raw Claude object into a clean CategoryAgentOutput. */
export function normalizeAgentOutput(raw: unknown, category: RadarCategory): CategoryAgentOutput {
  const obj = isRecord(raw) ? raw : {};
  const nothing = obj.nothing_this_week === true;
  const reason = typeof obj.reason === "string" ? obj.reason.trim() : "";
  const rawCandidates = Array.isArray(obj.candidates) ? obj.candidates : [];
  const candidates: CategoryAgentCandidate[] = nothing
    ? []
    : rawCandidates
        .map((c): CategoryAgentCandidate | null => {
          if (!isRecord(c)) return null;
          const name = typeof c.name === "string" ? c.name.trim() : "";
          const brief = typeof c.relevance_brief === "string" ? c.relevance_brief.trim() : "";
          if (!name || !brief) return null;
          return {
            name,
            relevance_brief: brief,
            search_query: strOrUndef(c.search_query),
            url: strOrUndef(c.url),
            neighborhood: strOrUndef(c.neighborhood),
          };
        })
        .filter((c): c is CategoryAgentCandidate => c !== null)
        .slice(0, 8);
  const gap = typeof obj.gap === "boolean" ? obj.gap : candidates.length < 5;
  return { category, candidates, nothing_this_week: nothing, reason, gap };
}

/** Flatten + order candidates for the inbox using the synthesis ranking, then
 *  agent order as a tiebreak. nothing_this_week categories contribute nothing. */
export function orderForInbox(
  outputs: CategoryAgentOutput[],
  synthesis: SynthesisResult | null,
): Array<{ category: RadarCategory; candidate: CategoryAgentCandidate; rank: number }> {
  const rankOf = new Map<string, number>();
  if (synthesis) {
    for (const r of synthesis.ranked) rankOf.set(keyOf(r.category, r.name), r.rank);
  }
  const seen = new Set<string>();
  const flat: Array<{ category: RadarCategory; candidate: CategoryAgentCandidate; rank: number }> = [];
  outputs.forEach((output, agentIdx) => {
    output.candidates.forEach((candidate, candIdx) => {
      const key = keyOf(output.category, candidate.name);
      if (seen.has(key)) return;
      seen.add(key);
      const synthRank = rankOf.get(key);
      // Ranked items first (by rank); unranked after, preserving agent/candidate order.
      const rank = synthRank ?? 1000 + agentIdx * 10 + candIdx;
      flat.push({ category: output.category, candidate, rank });
    });
  });
  return flat.sort((a, b) => a.rank - b.rank);
}

// ── Claude calls ──────────────────────────────────────────────────────────────

async function runCategoryAgent(
  category: RadarCategory,
  tasteBlock: string,
  week: WeekContext,
): Promise<CategoryAgentOutput> {
  try {
    const raw = await generateStructured<unknown>({
      system: CATEGORY_AGENT_BRIEFS[category],
      prompt: [
        `It is ${week.dayName} ${week.timeOfDay}, ${week.isoDate.slice(0, 10)} in ${week.city} (${week.year}).`,
        "",
        "Jerry's taste, pulled fresh:",
        tasteBlock,
        "",
        `Find what is genuinely worth surfacing in YOUR category (${category}) right now — or decide the answer this week is nothing.`,
        "Return JSON with this shape:",
        `{ "category": "${category}", "candidates": [{ "name": string, "relevance_brief": string (why this, why now), "search_query": string, "url"?: string, "neighborhood"?: string }], "nothing_this_week": boolean, "reason": string, "gap": boolean }`,
        "Rules: at most 6 candidates, each a real, specific place/event/product (no generic 'fun activities'). If nothing clears the bar, set nothing_this_week=true and candidates=[]. Never pad. Set gap=true if you found fewer than 5 strong fits.",
      ].join("\n"),
      schemaName: `category_agent_${category}`,
      temperature: 0.4,
      maxTokens: 4000,
    });
    return normalizeAgentOutput(raw, category);
  } catch (error) {
    console.warn(`[categoryAgents] ${category} agent failed`, error instanceof Error ? error.message : error);
    return { category, candidates: [], nothing_this_week: true, reason: "agent_error", gap: true };
  }
}

async function runSynthesis(input: {
  outputs: CategoryAgentOutput[];
  week: WeekContext;
  northTags: string[];
  circleNotes: string[];
}): Promise<SynthesisResult | null> {
  try {
    const agentSummary = input.outputs
      .map((o) =>
        o.nothing_this_week
          ? `${o.category}: nothing_this_week (${o.reason || "no reason"})`
          : `${o.category}: ${o.candidates.map((c) => c.name).join("; ") || "(none)"}`,
      )
      .join("\n");
    return await generateStructured<SynthesisResult>({
      system:
        "You are Jerry's weekly synthesis pass. You read across all six category agents and decide the shape of his week — what's worth surfacing, what's worth a plan, what's just worth knowing. You do NOT override quality judgments; you reorder the queue so the most 'right for right now' candidates lead. Consider the day/time, his North pillars, and what's happening in his Circle.",
      prompt: [
        `Week: ${input.week.dayName} ${input.week.timeOfDay}, ${input.week.city}.`,
        input.northTags.length ? `North pillars: ${input.northTags.slice(0, 10).join(", ")}.` : "",
        input.circleNotes.length ? `Circle recently: ${input.circleNotes.slice(0, 6).join(" · ")}.` : "",
        "",
        "Six agents returned:",
        agentSummary,
        "",
        'Return JSON: { "ranked": [{ "category": string, "name": string, "rank": number (1=lead), "why_now": string }], "week_shape": string (2-3 sentences a voice assistant could say), "gaps": string[] (categories under 5) }.',
        "Rank by 'right for right now', not raw score. Only include candidates the agents actually returned.",
      ]
        .filter(Boolean)
        .join("\n"),
      schemaName: "radar_week_synthesis",
      temperature: 0.3,
      maxTokens: 4000,
    });
  } catch (error) {
    console.warn("[categoryAgents] synthesis failed", error instanceof Error ? error.message : error);
    return null;
  }
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

export type CategoryScoutResult = {
  candidates_added: number;
  sources_added: number;
  by_category: Record<RadarCategory, number>;
  nothing_categories: RadarCategory[];
  gaps: RadarCategory[];
  week_shape: string | null;
};

export async function runCategoryScout(input: {
  userId: string;
  supabase?: SupabaseClient;
}): Promise<CategoryScoutResult> {
  const empty = emptyByCategory();
  const base: CategoryScoutResult = {
    candidates_added: 0,
    sources_added: 0,
    by_category: empty,
    nothing_categories: [],
    gaps: [],
    week_shape: null,
  };
  if (!hasAnthropic()) {
    console.warn("[categoryAgents] ANTHROPIC_API_KEY not set — skipping category agents");
    return base;
  }
  const supabase = input.supabase ?? getSupabaseServiceClient();
  const brain = await buildBrainContext({ userId: input.userId, includeWeather: false, supabase });
  const city = brain.homeCity?.trim();
  if (!city) {
    console.warn("[categoryAgents] no home city — skipping category agents");
    return base;
  }

  const taste: AgentTaste = {
    displayName: brain.founder?.displayName ?? null,
    city,
    lifeDirection: brain.founder?.lifeDirection ?? null,
    currentFocus: brain.founder?.currentFocus ?? null,
    vibeKeywords: brain.founder?.vibeKeywords ?? [],
    avoidKeywords: brain.founder?.avoidKeywords ?? [],
    dealbreakers: brain.founder?.dealbreakers ?? [],
    pinnedPrinciples: brain.founder?.pinnedPrinciples ?? [],
    memories: (brain.memory ?? []).map((m) => ({ content: m.content, kind: m.kind })),
    northTags: brain.northTags ?? [],
  };
  const week = buildWeekContext(new Date(brain.now), city);
  const tasteBlock = buildAgentTasteBlock(taste);

  // Six agents in parallel — total wall-clock ≈ one agent's time.
  const outputs = await Promise.all(
    RADAR_CATEGORIES.map((category) => runCategoryAgent(category, tasteBlock, week)),
  );

  const circleNotes = (brain.people ?? [])
    .map((p) => (p.recent_update ? `${p.name}: ${p.recent_update.title}` : null))
    .filter((s): s is string => Boolean(s));
  const synthesis = await runSynthesis({ outputs, week, northTags: taste.northTags, circleNotes });

  // Write the week-shape note for the voice brain.
  if (synthesis?.week_shape) {
    await writeWeekShape(supabase, input.userId, synthesis.week_shape);
  }

  // Write candidates to the inbox in synthesis order, tagged by category.
  const ordered = orderForInbox(outputs, synthesis);
  let added = 0;
  for (const { category, candidate, rank } of ordered) {
    const result = await upsertCandidateInboxItem({
      userId: input.userId,
      title: candidate.name,
      entityType: category === "style" ? "opportunity" : category === "events" ? "event" : "place",
      description: candidate.relevance_brief,
      url: candidate.url ?? null,
      rawPayload: {
        category,
        relevance_brief: candidate.relevance_brief,
        search_query: candidate.search_query ?? null,
        neighborhood: candidate.neighborhood ?? null,
        synthesis_rank: rank,
        source: "category_agent",
      } as Json,
      reason: { summary: candidate.relevance_brief, category, source: "category_agent" } as Json,
      supabase,
    });
    if (result === "created") added++;
  }

  const byCategory = emptyByCategory();
  for (const o of outputs) byCategory[o.category] = o.candidates.length;

  return {
    candidates_added: added,
    sources_added: 0,
    by_category: byCategory,
    nothing_categories: outputs.filter((o) => o.nothing_this_week).map((o) => o.category),
    gaps: synthesis?.gaps?.filter(isRadarCat) ?? outputs.filter((o) => o.gap).map((o) => o.category),
    week_shape: synthesis?.week_shape ?? null,
  };
}

async function writeWeekShape(supabase: SupabaseClient, userId: string, weekShape: string): Promise<void> {
  try {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    // One live week-shape note at a time — clear prior ones first.
    await supabase.from("session_context").delete().eq("user_id", userId).eq("kind", "week_shape");
    await supabase.from("session_context").insert({
      user_id: userId,
      content: weekShape,
      kind: "week_shape",
      expires_at: expiresAt,
    });
  } catch (error) {
    console.warn("[categoryAgents] week_shape write failed", error instanceof Error ? error.message : error);
  }
}

// ── small utils ───────────────────────────────────────────────────────────────

function emptyByCategory(): Record<RadarCategory, number> {
  return RADAR_CATEGORIES.reduce((acc, c) => {
    acc[c] = 0;
    return acc;
  }, {} as Record<RadarCategory, number>);
}

function keyOf(category: string, name: string): string {
  return `${category}::${name.trim().toLowerCase()}`;
}

function isRadarCat(value: unknown): value is RadarCategory {
  return typeof value === "string" && (RADAR_CATEGORIES as readonly string[]).includes(value);
}

function strOrUndef(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
