/**
 * Plan Generator — turns a strong item into a practical, taste-aware plan.
 *
 * Runs ONLY on explicit user trigger (item detail "Plan this" button or
 * the `/api/items/[id]/generate-plan` endpoint). Never automatic. Never
 * on page load.
 *
 * Returns a Zod-validated GeneratedPlan ready for persistence into
 * `plans` + `plan_sections` + optional `today_timeline_items`.
 *
 * Anthropic-first; deterministic fallback when the key is missing or the
 * model returns invalid JSON. Fallback is honest — it produces a real
 * plan structure without pretending to know what it doesn't.
 */

import "server-only";

import { hasAnthropic } from "@/lib/ai/anthropic";
import { generateStructured } from "@/lib/ai/structured";
import { buildBrainContext } from "@/lib/brain/context";
import { buildInterestGraph } from "@/lib/brain/interestGraph";
import { summarizeInterestGraph } from "@/lib/brain/interests";
import { getCurrentWeather } from "@/lib/sources/openMeteo";
import { getDefaultLocation } from "@/lib/env";
import type { IndexedItem } from "@/lib/index/types";
import {
  generatedPlanSchema,
  slugify,
  type GeneratedPlan,
  type PlanGenerationResult,
} from "@/lib/brain/planTypes";

// ── Prompt ──────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Jarvis's PLAN GENERATOR. You turn a single item into a practical,
refined, taste-aware plan the founder can actually execute.

CORE PRINCIPLES
- A plan is NOT a generic itinerary. It is the move. The single best version of this.
- No filler. No fake certainty. If a reservation, ticket, or link is unknown,
  say "confirm" — never pretend booking is done.
- Respect the founder's schedule: leaves for work ~06:20, home ~16:30. Weeknights
  have limited energy. Higher-effort outings belong on weekends unless explicitly
  worth a weeknight.
- Refined, masculine, cinematic, understated. Avoid corny, basic, touristy, trend-chasing.
- Paid plans need stronger justification — say why the spend is or isn't worth it.

SECTION GUIDANCE (use only what's relevant — not every plan needs all of these)
- "why": Why this belongs in the founder's world. Concrete, not generic.
- "timing": When to go. Does it fit after work / a weekend / a route home? If
  the date/time is unknown, say what needs confirming.
- "before": Prep — reservation, ticket, dress check. Only what saves wasted effort.
- "move": The actual main plan. What to do.
- "route": Use known location/distance if available. Otherwise clean placeholder
  language — do not invent directions.
- "atmosphere": Vibe and expectation. Why it fits the taste.
- "wear" / "bring": Only if genuinely useful. Refined, practical.
- "cost": Free / low / paid / high. Why spend is justified (or not).
- "detours": 0–3 max. Optional, restrained, never filler.
- "after": What to do after, only if natural.
- "notes": Honest caveats or things to verify.

OUTPUT
Strict JSON matching the GeneratedPlan schema:
- slug: lowercase-kebab, derived from title.
- status: ALWAYS "draft" (activation is a user action).
- sections: 2–11 sections, sorted, each with a section_type from the enum.
- timeline: 0–8 entries. Only include if you have real timing data.
- grab_list: 0–8 items. Only what's actually needed.
- cautions: 0–4 short warnings if any apply (cost, energy, timing risk).
- hero_angle: one tight sentence framing the plan.
- why_this_fits: 1–2 sentences. Specific, not generic.

NEVER
- Fabricate reservation confirmations, addresses, or phone numbers.
- Pad sections with obvious advice.
- Recommend "Top 10 things to do" energy.
- Stack a weeknight with high-effort detours.
- Lie about what's been booked or confirmed.`;

// ── Public API ──────────────────────────────────────────────────────────────

export type GeneratePlanInput = {
  item: IndexedItem;
};

export async function generatePlanFromItem(
  input: GeneratePlanInput,
): Promise<PlanGenerationResult> {
  if (!hasAnthropic()) {
    return {
      plan: deterministicPlan(input.item),
      fallbackUsed: true,
      reason: "no_anthropic_key",
    };
  }

  try {
    const context = await buildBrainContext();
    const graph = buildInterestGraph({ context });
    const weather = await safeWeather();
    const promptBody = renderPrompt(input.item, context, graph, weather);

    const raw = await generateStructured<unknown>({
      system: SYSTEM_PROMPT,
      prompt: promptBody,
      schemaName: "GeneratedPlan",
      temperature: 0.4,
    });

    const parsed = generatedPlanSchema.safeParse(raw);
    if (!parsed.success) {
      console.error("[plan.generator] schema mismatch", parsed.error.message);
      return {
        plan: deterministicPlan(input.item),
        fallbackUsed: true,
        reason: "schema_invalid",
      };
    }

    // Force draft status (never trust the model on lifecycle)
    return {
      plan: { ...parsed.data, status: "draft" },
      fallbackUsed: false,
    };
  } catch (error) {
    console.error("[plan.generator] claude failed", error);
    return {
      plan: deterministicPlan(input.item),
      fallbackUsed: true,
      reason: "claude_error",
    };
  }
}

// ── Prompt rendering ────────────────────────────────────────────────────────

function renderPrompt(
  item: IndexedItem,
  context: Awaited<ReturnType<typeof buildBrainContext>>,
  graph: ReturnType<typeof buildInterestGraph>,
  weather: { temperatureF: number; weatherCode: number } | null,
): string {
  const now = new Date();
  const isWeeknight = now.getDay() >= 1 && now.getDay() <= 4;
  const evidence = readEvidence(item);

  return JSON.stringify(
    {
      now: now.toISOString(),
      day_of_week: now.toLocaleDateString("en-US", { weekday: "long" }),
      is_weeknight: isWeeknight,
      schedule_hints: {
        leaves_for_work: "06:20",
        leaves_schaumburg: "15:30",
        home_by: "16:30",
        weeknight_energy: isWeeknight ? "limited" : "wider_aperture",
      },
      item: {
        id: item.id,
        title: item.title,
        subtitle: item.subtitle,
        type: item.type,
        category: item.category,
        description: item.description?.slice(0, 600),
        location_name: item.locationName,
        address: item.address,
        lat: item.lat,
        lng: item.lng,
        starts_at: item.startsAt,
        ends_at: item.endsAt,
        expires_at: item.expiresAt,
        url: item.url,
        image_url: item.imageUrl,
        tags: item.tags,
        reasons: item.reasons,
        score: item.score,
      },
      evidence,
      founder: {
        life_direction: context.founder.lifeDirection,
        current_focus: context.founder.currentFocus,
        vibe: context.founder.vibeKeywords,
        avoid: context.founder.avoidKeywords,
        dealbreakers: context.founder.dealbreakers,
        principles: context.founder.pinnedPrinciples,
      },
      memory_summary: context.memory.slice(0, 8).map((m) => m.content),
      recent_actions: context.recentActions.slice(0, 10),
      interest_graph_summary: summarizeInterestGraph(graph, {
        maxSubinterestsPerArea: 4,
      }),
      weather,
      instructions: [
        "Generate a single plan for this item — the operator move.",
        "Use 2–8 sections, only those that genuinely apply.",
        "If timing is unknown, include a 'timing' section that says what to confirm.",
        "Include 'route' only if location data is available; otherwise omit or use placeholder language.",
        "Include 'detours' only when truly worth it. 0 is valid.",
        "Set effort_level and spending_posture honestly.",
        "Set status to 'draft'. Activation is a user action.",
      ],
    },
    null,
    2,
  );
}

// ── Deterministic fallback ──────────────────────────────────────────────────

/**
 * Real, honest fallback plan. Uses the item's actual fields. Does not
 * invent timing, prices, or atmosphere details it cannot know.
 */
function deterministicPlan(item: IndexedItem): GeneratedPlan {
  const slug = slugify(`${item.title}-${item.id.slice(0, 6)}`);
  const planType = inferPlanType(item);
  const effort = inferEffort(item);
  const spending = inferSpending(item);

  const sections: GeneratedPlan["sections"] = [
    {
      key: "why",
      title: "Why This",
      section_type: "why",
      body:
        item.reasons[0] ??
        `${item.title} matches your current Radar signal.`,
      sort_order: 10,
    },
    {
      key: "timing",
      title: "Timing",
      section_type: "timing",
      body: item.startsAt
        ? `Scheduled for ${formatWhen(item.startsAt)}. Confirm before leaving.`
        : "No date confirmed yet. Pick a window that fits — weeknight evenings are limited.",
      sort_order: 20,
    },
    {
      key: "move",
      title: "The Move",
      section_type: "move",
      body: item.description?.slice(0, 600) ??
        `Go to ${item.locationName ?? item.title}. Stay focused. Don't overstack.`,
      sort_order: 30,
    },
    {
      key: "details",
      title: "Details",
      section_type: "notes",
      body: [
        item.locationName,
        item.address,
        item.url ? `Reference: ${item.url}` : null,
      ]
        .filter(Boolean)
        .join("\n") || "No additional details. Confirm specifics before going.",
      sort_order: 40,
    },
    {
      key: "next",
      title: "Next Step",
      section_type: "before",
      body: item.url
        ? "Open the reference link, confirm hours/availability, then book if needed."
        : "Confirm hours, availability, and any reservation requirements before going.",
      sort_order: 50,
    },
  ];

  return {
    title: item.title,
    subtitle: item.subtitle,
    slug,
    plan_type: planType,
    status: "draft",
    starts_at: item.startsAt,
    ends_at: item.endsAt,
    location_name: item.locationName,
    address: item.address,
    hero_angle: item.reasons[0] ?? `Quick plan for ${item.title}.`,
    why_this_fits: item.reasons[0] ?? "Matches your current taste profile.",
    effort_level: effort,
    spending_posture: spending,
    confidence: 0.5,
    sections,
    timeline: item.startsAt
      ? [
          {
            title: item.title,
            starts_at: item.startsAt,
            ends_at: item.endsAt,
            sort_order: 10,
          },
        ]
      : [],
    grab_list: [],
    cautions: ["Deterministic draft — refine with Anthropic when available."],
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function inferPlanType(item: IndexedItem): GeneratedPlan["plan_type"] {
  switch (item.type) {
    case "restaurant":
      return "dining";
    case "event":
      return "event";
    case "culture":
    case "creative":
      return "culture";
    case "style":
    case "product":
      return "style";
    case "travel":
      return "travel";
    case "real_estate":
      return "real_estate";
    case "health":
      return "fitness";
    case "place":
      return "outdoors";
    default:
      return "general";
  }
}

function inferEffort(item: IndexedItem): GeneratedPlan["effort_level"] {
  const tags = new Set(item.tags);
  if (tags.has("high-effort") || tags.has("all-day")) return "high";
  if (tags.has("low-effort")) return "low";
  return "medium";
}

function inferSpending(item: IndexedItem): GeneratedPlan["spending_posture"] {
  const tags = new Set(item.tags);
  if (tags.has("free")) return "free";
  if (tags.has("paid") || tags.has("ticketed")) return "paid";
  if (item.type === "restaurant" || item.type === "event") return "paid";
  return "low";
}

function readEvidence(item: IndexedItem): Record<string, unknown> {
  const raw = isRecord(item.rawPayload) ? item.rawPayload : {};
  return {
    source_url:
      typeof raw.source_url === "string" ? raw.source_url : item.url ?? null,
    source_title:
      typeof raw.source_title === "string" ? raw.source_title : null,
    lead_name: typeof raw.lead_name === "string" ? raw.lead_name : null,
    query_group: typeof raw.query_group === "string" ? raw.query_group : null,
    lane_id: typeof raw.lane_id === "string" ? raw.lane_id : null,
  };
}

async function safeWeather(): Promise<{
  temperatureF: number;
  weatherCode: number;
} | null> {
  try {
    const home = getDefaultLocation();
    const w = await getCurrentWeather({ lat: home.lat, lng: home.lng });
    return { temperatureF: w.temperatureF, weatherCode: w.weatherCode };
  } catch {
    return null;
  }
}

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
