import "server-only";

import { hasAnthropic } from "@/lib/ai/anthropic";
import { generateStructured } from "@/lib/ai/structured";
import type {
  BrainContextPacket,
  BrainDecision,
  CurationInput,
} from "@/lib/brain/types";
import {
  RADAR_DEFAULT_SELECTED_LIMIT,
  RADAR_IDEAL_ACTIVE_ITEM_LIMIT,
} from "@/lib/brain/constants";

const SYSTEM_PROMPT = `You are Jarvis's CURATOR. Your job is to protect the founder's attention.

CORE PRINCIPLE: Jarvis is NOT a feed. Radar is a small, intentional tray — not a scroll.
An empty or near-empty result is correct when nothing is strong enough. Silence is always
better than filler. The goal is 3–7 items, never to fill a quota.

SELECTION CRITERIA:
- Prefer atmospheric, craft-led, hidden, intentional, surprising.
- Avoid: generic, touristy, corporate, chain, loud, mass-market, obvious, clickbait.
- Consider timing: a Monday evening item that requires energy should be questioned.
- Consider distance: far-away items need proportionally stronger payoff.
- A high API score is a signal, not a mandate. Use your judgment.

DESTINATION ROUTING:
- "radar": strong, timely, worth acting on this week. This is the front room.
- "holding": genuinely strong but not urgent — good find, wrong time, no clear trigger
  yet. Not wrong, just not right now. The back room. Use this generously.

DEALBREAKERS (always reject, suggest "archived"):
- Conflicts with the founder's explicit dealbreakers or avoid keywords.
- Chain restaurants, hotel restaurants, tourist traps.
- Generic "Top 10 lists" with no specific recommendation.
- Events that are vague or already started.

WORKDAY ENERGY:
- Mon–Thu: weight items that are accessible after work. Deprioritize all-day
  commitments, long drives, or high-effort outings unless the score is exceptional.
- Fri–Sun: wider aperture.

SOURCES:
- Structured API data (google-places, ticketmaster) is more reliable than web-research
  articles. Web-research items (local-radar, tavily, brave tags) need a strong lead name
  or specific venue to be worth selecting.

Return strict JSON matching the BrainDecision schema.
- selected[]: items for Radar (radar) or Holding (holding). Max ${RADAR_IDEAL_ACTIVE_ITEM_LIMIT} combined.
- rejected[]: everything else. Include ALL unused candidates here.
- For each selection: one tight display_angle — the single hook Jarvis would frame it with.
- notes: brief reasoning for the overall set.`;

export async function runCurator(input: CurationInput): Promise<BrainDecision> {
  if (!hasAnthropic()) {
    return deterministicCuration(input, "ANTHROPIC_API_KEY missing");
  }

  const max = input.maxSelected ?? RADAR_DEFAULT_SELECTED_LIMIT;
  const prompt = renderCuratorPrompt(input, max);

  try {
    const result = await generateStructured<BrainDecision>({
      system: SYSTEM_PROMPT,
      prompt,
      schemaName: "BrainDecision",
    });
    return {
      selected: (result.selected ?? []).slice(0, max),
      rejected: result.rejected ?? [],
      notes: result.notes ?? "",
      fallbackUsed: false,
    };
  } catch (error) {
    console.error("[brain.curator] structured generation failed", error);
    return deterministicCuration(input, "curator error");
  }
}

function renderCuratorPrompt(input: CurationInput, max: number): string {
  const { context, shortlist } = input;

  const founder = context.founder;
  const now = new Date(context.now);
  const dayOfWeek = now.toLocaleDateString("en-US", { weekday: "long" });
  const isWeekday = now.getDay() >= 1 && now.getDay() <= 4;

  const candidates = shortlist.map((c) => ({
    id: c.item.id,
    title: c.item.title,
    category: c.item.category,
    type: c.item.type,
    score: c.score,
    score_reasons: c.reasons,
    subtitle: c.item.subtitle,
    description: c.item.description?.slice(0, 320),
    location: c.item.locationName ?? c.item.address,
    starts_at: c.item.startsAt,
    expires_at: c.item.expiresAt,
    tags: c.item.tags,
    source: c.item.source,
    destination_hint: c.item.destination,
  }));

  return JSON.stringify(
    {
      now: context.now,
      day_of_week: dayOfWeek,
      is_weekday: isWeekday,
      home: { city: context.homeCity, state: context.homeState },
      founder: {
        life_direction: founder.lifeDirection,
        current_focus: founder.currentFocus,
        vibe: founder.vibeKeywords,
        avoid: founder.avoidKeywords,
        dealbreakers: founder.dealbreakers,
        principles: founder.pinnedPrinciples,
      },
      memory: context.memory.slice(0, 12).map((m) => m.content),
      recent_actions: context.recentActions,
      active_plan: context.activePlan,
      weather: context.weather,
      north_tags: context.northTags,
      max_selected: max,
      instructions: [
        "Select 0 to " + max + " items. 0 is a valid answer.",
        "Route strong-but-not-urgent items to destination:'holding'.",
        "Route timely, high-confidence items to destination:'radar'.",
        "Reject everything not selected.",
      ],
      candidates,
    },
    null,
    2,
  );
}

function deterministicCuration(
  input: CurationInput,
  reason: string,
): BrainDecision {
  const max = input.maxSelected ?? RADAR_DEFAULT_SELECTED_LIMIT;
  // Deterministic fallback: take top candidates by score, respect the limit.
  // Route lowest-ranked of the selected set to "holding" to simulate restraint.
  const eligible = input.shortlist.slice(0, max);
  const radarCount = Math.ceil(eligible.length * 0.7); // 70% to radar, 30% to holding

  const selected = eligible.map((s, idx) => ({
    itemId: s.item.id,
    destination:
      (idx < radarCount ? "radar" : "holding") as BrainDecision["selected"][number]["destination"],
    confidence: clamp01(s.score),
    reason: s.reasons[0] ?? "Top deterministic score",
    displayAngle: idx === 0 ? "Top pick this window" : "Worth a look",
    tags: s.item.tags.slice(0, 4),
  }));

  const rejected = input.shortlist.slice(max).map((s) => ({
    itemId: s.item.id,
    reason: s.reasons[0] ?? "Below cutoff in deterministic fallback",
    suggestedStatus: "discovered" as const,
  }));

  return {
    selected,
    rejected,
    notes: `Deterministic fallback: ${reason}`,
    fallbackUsed: true,
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function summarizeContext(context: BrainContextPacket): string {
  return [
    `home=${context.homeCity ?? "?"}`,
    `weather=${context.weather?.temperatureF ?? "?"}F`,
    `signals=${context.recentSignals.length}`,
    `memory=${context.memory.length}`,
    `northTags=${context.northTags.slice(0, 3).join(",")}`,
  ].join(" ");
}
