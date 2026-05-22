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
import { buildConsiderationBrief } from "@/lib/items/considerationBrief";
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
- "cost": Free / low / paid / high / unknown. Why spend is justified (or not).
- "detours": 0–3 max. Optional, restrained, never filler.
- "after": What to do after, only if natural.
- "alternatives": Product/style comparison or backup options only when useful.
- "research": Use for article, idea, land, real estate, and creative signals.
- "notes": Honest caveats or things to verify.

ITEM-TYPE ADAPTATION
- Dining/place: why, best window, before, move, route, atmosphere, wear/bring,
  cost, restrained detours, after.
- Event/culture/music/sports: why, timing, ticket/entry check, before, route,
  move, after, cost, optional detours.
- Activity/outdoors/sports ideas: why, best window, prep, route, effort/recovery,
  gear/bring, weather notes only if weather context exists, after.
- Product/style/gear: why, use case, fit check, buy/hold/compare, cost,
  alternatives, what to verify, direction fit.
- Article/idea/land/real estate/creative: why it matters, research path, next
  questions, leverage angle, what to watch, first small move, hold/act/archive.

OUTPUT
Strict JSON matching the GeneratedPlan schema:
- slug: lowercase-kebab, derived from title.
- status: ALWAYS "draft" (activation is a user action).
- sections: 3–6 concise sections, sorted, each with a section_type from the enum.
- Generate core sections first: why, before, move, notes/details, next step.
- timeline: 0–8 entries. Only include if you have real timing data.
- grab_list: 0–8 items. Only what's actually needed.
- cautions: 0–4 short warnings if any apply (cost, energy, timing risk).
- hero_angle: one tight sentence framing the plan.
- why_this_fits: 1–2 sentences. Specific, not generic.
- primary_move: the obvious first move in one calm sentence.
- best_window: optional; only when timing can be stated without inventing.
- source_item_id: copy the source item id.

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
    const context = await buildBrainContext({ includeWeather: false });
    const graph = buildInterestGraph({ context });
    const promptBody = renderPrompt(input.item, context, graph);

    const raw = await generateStructured<unknown>({
      system: SYSTEM_PROMPT,
      prompt: promptBody,
      schemaName: "GeneratedPlan",
      temperature: 0.4,
      maxTokens: 2600,
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
): string {
  const now = new Date();
  const isWeeknight = now.getDay() >= 1 && now.getDay() <= 4;
  const evidence = readEvidence(item);
  const brief = buildConsiderationBrief(item);

  return JSON.stringify(
    {
      now: now.toISOString(),
      day_of_week: now.toLocaleDateString("en-US", { weekday: "long" }),
      is_weeknight: isWeeknight,
      schedule_hints: {
        leaves_for_work: context.weeklyRhythm?.leaveHome ?? "06:20",
        work_start: context.weeklyRhythm?.workStart ?? "07:00",
        leaves_schaumburg: context.weeklyRhythm?.leaveWork ?? "15:30",
        home_by: context.weeklyRhythm?.arriveHome ?? "16:30",
        workdays: context.weeklyRhythm?.workdays ?? [
          "monday",
          "tuesday",
          "wednesday",
          "thursday",
          "friday",
        ],
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
      consideration_brief: {
        verdict: brief.verdict,
        title: brief.title,
        one_line: brief.oneLine,
        jarvis_take: brief.jarvisTake,
        best_move_title: brief.bestMoveTitle,
        best_move_body: brief.bestMoveBody,
        primary_action: brief.primaryAction,
        category: brief.categoryLabel,
        facts: brief.facts,
        indicators: brief.indicators,
        source_evidence: brief.sourceEvidence,
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
      weather: context.weather,
      instructions: [
        "Generate a single plan for this item — the operator move.",
        "Use 3–6 concise sections, only those that genuinely apply.",
        "Adapt the sections to the item type; do not force nightlife, route, or map sections onto products and ideas.",
        "If timing is unknown, include a 'timing' section that says what to confirm.",
        "Include 'route' only if location data is available; otherwise omit or use placeholder language.",
        "For products, style, articles, ideas, land, and creative inspiration, prefer research/compare/verify steps over fake execution logistics.",
        "Include 'detours' only when truly worth it. 0 is valid.",
        "Set effort_level and spending_posture honestly.",
        "Set status to 'draft'. Activation is a user action.",
        "Set source_item_id to the provided item id.",
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
  const brief = buildConsiderationBrief(item);
  const slug = slugify(`${item.title}-${item.id.slice(0, 6)}`);
  const planType = inferPlanType(item);
  const effort = inferEffort(item);
  const spending = inferSpending(item);
  const primaryMove = inferPrimaryMove(item, brief);
  const bestWindow = inferBestWindow(item);
  const whyThis =
    brief.jarvisTake ||
    brief.bestMoveBody ||
    item.reasons[0] ||
    "Good enough to structure, but still needs confirmation before action.";

  const sections: GeneratedPlan["sections"] = [
    {
      key: "why",
      title: "Why This",
      section_type: "why",
      body: whyThis,
      sort_order: 10,
    },
    {
      key: "timing",
      title: "Timing",
      section_type: "timing",
      body: item.startsAt
        ? `Scheduled for ${formatWhen(item.startsAt)}. Confirm before leaving.`
        : bestWindow ??
          "No date confirmed yet. Pick a window that fits — weeknight evenings are limited.",
      sort_order: 20,
    },
    {
      key: "move",
      title: "The Move",
      section_type: "move",
      body: primaryMove,
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
    title: brief.title || item.title,
    subtitle: item.subtitle ?? brief.oneLine,
    slug,
    plan_type: planType,
    status: "draft",
    starts_at: item.startsAt,
    ends_at: item.endsAt,
    location_name: item.locationName,
    address: item.address,
    hero_angle: brief.oneLine || item.reasons[0] || `Quick plan for ${item.title}.`,
    why_this_fits: whyThis.slice(0, 360),
    best_window: bestWindow,
    effort_level: effort,
    spending_posture: spending,
    confidence: item.briefing?.confidence ?? item.score ?? 0.5,
    primary_move: primaryMove.slice(0, 220),
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
    source_item_id: item.id,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function inferPlanType(item: IndexedItem): GeneratedPlan["plan_type"] {
  const tags = new Set(item.tags.map((tag) => tag.toLowerCase()));
  const category = (item.category ?? "").toLowerCase();
  switch (item.type) {
    case "restaurant":
      return "dining";
    case "event":
      return "event";
    case "place":
      return tags.has("outdoors") || category.includes("outdoor")
        ? "outdoors"
        : "activity";
    case "culture":
      return "culture";
    case "creative":
      return "creative";
    case "style":
      return "style";
    case "product":
      return "product";
    case "travel":
      return "travel";
    case "real_estate":
      return tags.has("land") || category.includes("land") ? "land" : "real_estate";
    case "health":
      return "fitness";
    case "recommendation":
    case "north_step":
    case "pillar_signal":
      return "idea";
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
  if (item.type === "product" || item.type === "style") return "unknown";
  return "low";
}

function inferPrimaryMove(
  item: IndexedItem,
  brief: ReturnType<typeof buildConsiderationBrief>,
): string {
  if (brief.primaryAction === "plan") {
    return "Turn this into a draft plan, then confirm the one thing that could waste the trip: timing, access, or availability.";
  }
  if (brief.primaryAction === "hold") {
    return "Keep it in Holding and compare it against a stronger option before spending time or money.";
  }
  if (brief.primaryAction === "pass" || brief.primaryAction === "archive") {
    return "Do not force it. Archive the signal unless better evidence appears.";
  }
  if (item.url) {
    return "Open the source, confirm the practical details, then decide whether it deserves a real slot.";
  }
  return brief.bestMoveBody || "Confirm the details, then make the smallest useful move.";
}

function inferBestWindow(item: IndexedItem): string | undefined {
  if (item.startsAt) return formatWhen(item.startsAt);
  if (item.type === "restaurant" || item.type === "place") {
    return "Best as a practical after-work move only if it is low friction; otherwise hold it for the weekend.";
  }
  if (item.type === "event") return "Confirm the actual date and entry window before committing.";
  if (item.type === "product" || item.type === "style") {
    return "No rush. Compare before buying unless availability is genuinely limited.";
  }
  if (item.type === "real_estate") {
    return "Weekend research window. Do not rush without better evidence.";
  }
  return undefined;
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
