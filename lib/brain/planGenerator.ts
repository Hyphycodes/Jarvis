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
import { getDailyForecast } from "@/lib/sources/openMeteo";
import { extractUrls, hasTavily, searchWeb } from "@/lib/sources/tavily";
import {
  hasGooglePlaces,
  nearbyPlaces,
  pickBestVenuePhoto,
  searchPlaceForEnrichment,
} from "@/lib/sources/googlePlaces";
import type { PlanChatContext } from "@/lib/plans/chatContext";
import { queryWardrobeForEvent } from "@/lib/wardrobe/wardrobeAgent";
import { sourceWardrobeGaps } from "@/lib/wardrobe/sourcingAgent";
import {
  generatedPlanSchema,
  slugify,
  type GeneratedPlan,
  type PlanGenerationResult,
  type PlanShape,
} from "@/lib/brain/planTypes";

// ── Prompt ──────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Jarvis's PLAN GENERATOR. You turn a single item into a practical,
refined, taste-aware plan the founder can actually execute.

CORE PRINCIPLES
- A plan is NOT a generic itinerary. It is the move. The single best version of this.
- No filler. No fake certainty. If a reservation, ticket, or link is unknown,
  say "confirm" — never pretend booking is done.
- Respect the founder's saved schedule when it is provided. If schedule context is
  missing, do not invent commute or work hours. Higher-effort outings need a clear
  timing reason.
- Refined, masculine, cinematic, understated. Avoid corny, basic, touristy, trend-chasing.
- Paid plans need stronger justification — say why the spend is or isn't worth it.

SECTION GUIDANCE (use only what's relevant — not every plan needs all of these)
- "why": Why this belongs in the founder's world. Concrete, not generic.
- "timing": When to go. Does it fit after work / a weekend / a route home? If
  the date/time is unknown, say what needs confirming.
- "before": Prep — reservation and timing. If reservation context is provided,
  state a SPECIFIC suggested time to book (reason from the hours + the day/occasion;
  e.g. "Book 7:30 PM Saturday — first seating after the room settles"). If a
  booking link is provided, tell the user to tap Reserve. Never claim a booking is
  already made.
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

CHAT-SOURCED PLAN CONTEXT
- If chat_context.timingHint exists, treat it as the user's stated window and
  make the plan respect it. Do not replace "Friday evening" with generic timing.
- If chat_context.partySize exists, use it in cost posture and logistics.
- If supplemental weather exists, include a weather-aware wear/bring suggestion.
- If supplemental place details or alternatives exist, use them as verification
  context, not as proof that booking is complete.
- If cost_estimate exists, include a concise cost section.

MENU
- If menu context is provided, populate menu_highlights with 3-5 SPECIFIC dishes
  the founder should order. Use real dish names from the context — never invent
  menu items. Bias toward animal-based, refined, signature plates; skip generic
  apps and filler. Each note is one short reason. If the menu context is thin or
  unclear, return fewer items or omit menu_highlights entirely. Do not guess.

NEVER
- Fabricate reservation confirmations, addresses, or phone numbers.
- Pad sections with obvious advice.
- Recommend "Top 10 things to do" energy.
- Stack a weeknight with high-effort detours.
- Lie about what's been booked or confirmed.`;

// ── Public API ──────────────────────────────────────────────────────────────

export type GeneratePlanInput = {
  item: IndexedItem;
  chatContext?: PlanChatContext;
  /** Owner id — enables wardrobe lookups. When absent, wardrobe is skipped. */
  userId?: string;
};

export async function generatePlanFromItem(
  input: GeneratePlanInput,
): Promise<PlanGenerationResult> {
  const supplemental = await buildSupplementalContext(
    input.item,
    input.chatContext,
    input.userId,
  );

  if (!hasAnthropic()) {
    return {
      plan: deterministicPlan(input.item, input.chatContext),
      fallbackUsed: true,
      reason: "no_anthropic_key",
      selectedPhotoUrl: supplemental.selectedPhotoUrl,
      reservation: supplemental.reservation,
    };
  }

  try {
    const context = await buildBrainContext({ includeWeather: false });
    const graph = buildInterestGraph({ context });
    const promptBody = renderPrompt(
      input.item,
      context,
      graph,
      input.chatContext,
      supplemental,
    );

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
        plan: deterministicPlan(input.item, input.chatContext),
        fallbackUsed: true,
        reason: "schema_invalid",
        selectedPhotoUrl: supplemental.selectedPhotoUrl,
        reservation: supplemental.reservation,
      };
    }

    // Force draft status (never trust the model on lifecycle)
    return {
      plan: { ...parsed.data, status: "draft" },
      fallbackUsed: false,
      selectedPhotoUrl: supplemental.selectedPhotoUrl,
      reservation: supplemental.reservation,
    };
  } catch (error) {
    console.error("[plan.generator] claude failed", error);
    return {
      plan: deterministicPlan(input.item, input.chatContext),
      fallbackUsed: true,
      reason: "claude_error",
      selectedPhotoUrl: supplemental.selectedPhotoUrl,
      reservation: supplemental.reservation,
    };
  }
}

// ── Prompt rendering ────────────────────────────────────────────────────────

function renderPrompt(
  item: IndexedItem,
  context: Awaited<ReturnType<typeof buildBrainContext>>,
  graph: ReturnType<typeof buildInterestGraph>,
  chatContext: PlanChatContext | undefined,
  supplemental: PlanSupplementalContext,
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
      schedule_hints: context.weeklyRhythm
        ? {
            enabled: context.weeklyRhythm.enabled,
            leaves_for_work: context.weeklyRhythm.leaveHome,
            work_start: context.weeklyRhythm.workStart,
            leaves_work: context.weeklyRhythm.leaveWork,
            home_by: context.weeklyRhythm.arriveHome,
            workdays: context.weeklyRhythm.workdays,
            work_location: context.weeklyRhythm.workLocation,
            weeknight_energy:
              context.weeklyRhythm.enabled && isWeeknight
                ? "limited"
                : "use_item_timing",
          }
        : null,
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
        plan_shape: detectPlanShape(item), // tells the LLM what kind of plan this is
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
      chat_context: chatContext ?? null,
      supplemental_context: {
        ...supplemental,
        menu_corpus: supplemental.menuCorpus,
        reservation: supplemental.reservation
          ? {
              reservable: supplemental.reservation.reservable,
              has_booking_url: Boolean(supplemental.reservation.bookingUrl),
              has_website: Boolean(supplemental.reservation.website),
              hours_summary: supplemental.reservation.hoursSummary,
            }
          : null,
        wardrobe: supplemental.wardrobeContext
          ? {
              summary: supplemental.wardrobeContext.summary,
              owned: supplemental.wardrobeContext.ownedPieces.map((p) => p.description),
              gaps: supplemental.wardrobeContext.gaps,
            }
          : null,
        sourcing:
          supplemental.sourcingResults.length > 0
            ? supplemental.sourcingResults.map((r) => ({
                needed: r.gap,
                options: r.options.map(
                  (o) =>
                    `${o.title}${o.price ? ` — ${o.price}` : ""}${o.link ? ` (${o.source ?? "buy"})` : ""}`,
                ),
              }))
            : null,
      },
      instructions: [
        "Generate a single plan for this item — the operator move.",
        chatContext?.timingHint
          ? `Respect this user-stated timing window: ${chatContext.timingHint}.`
          : "If timing is unknown, include a 'timing' section that says what to confirm.",
        "Use 3–6 concise sections, only those that genuinely apply.",
        "Adapt the sections to the item type; do not force nightlife, route, or map sections onto products and ideas.",
        "Include 'route' only if location data is available; otherwise omit or use placeholder language.",
        "Use supplemental weather for outfit/wear guidance when present.",
        "Use supplemental place details for verification only; do not claim a reservation or booking exists.",
        "Use supplemental reservation context to suggest a specific booking time when present; if a booking URL exists, refer to the Reserve action instead of writing the URL.",
        "If menu_corpus is present, extract real dish names into menu_highlights. Never invent menu items that are not clearly present in the corpus.",
        "Use cost_estimate and party size to write a practical cost section when relevant.",
        "For products, style, articles, ideas, land, and creative inspiration, prefer research/compare/verify steps over fake execution logistics.",
        "For 'detours' and 'after' sections: structure as satellites — specific named places with what they are, why they fit, distance/timing, and rough cost. Format: one paragraph intro, then each satellite as a bullet: '**Name** — [what it is, why it fits, ~X min away, ~$Y]'. Max 2 before, 2 instead, 2 after. If nothing genuinely fits, omit the section entirely.",
        "Include an 'alternatives' section with 2–3 pivot options (if you change your mind at the last minute, these are the real nearby options). Same satellite bullet format.",
        "For shape 'occasion': focus sections on contribution (gift ideas in 'detours'), attendance logistics in 'before', and relational context in 'notes'.",
        "For shape 'acquisition': structure 'before' as sourcing options with prices and where to get them.",
        "If wardrobe.owned is present, reference specific owned pieces in the wear section. If wardrobe.gaps + sourcing are present, include a sourcing note in the wear section: what to get, approximate price, and buy link.",
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
function deterministicPlan(item: IndexedItem, chatContext?: PlanChatContext): GeneratedPlan {
  const brief = buildConsiderationBrief(item);
  const slug = slugify(`${item.title}-${item.id.slice(0, 6)}`);
  const planType = inferPlanType(item);
  const effort = inferEffort(item);
  const spending = inferSpending(item);
  const primaryMove = inferPrimaryMove(item, brief);
  const bestWindow = chatContext?.timingHint ?? inferBestWindow(item);
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
        : chatContext?.timingHint
          ? `Use the window the user gave: ${chatContext.timingHint}. Confirm hours and availability before committing.`
        : bestWindow ?? "No date confirmed yet. Pick a real window before acting.",
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
      key: "cost",
      title: "Cost Check",
      section_type: "cost",
      body: costEstimateForItem(item, chatContext?.partySize),
      sort_order: 45,
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
    is_sequential: false,
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
    cautions: [],
    source_item_id: item.id,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

type PlanSupplementalContext = {
  weather: {
    date: string;
    highF: number;
    lowF: number;
    precipitationProbability: number;
    weather: string;
  } | null;
  placeDetails: {
    name?: string;
    address?: string;
    rating?: number;
    userRatingCount?: number;
    priceLevel?: string;
    website?: string;
    mapsUrl?: string;
    hoursSummary?: string;
    summary?: string;
    photoNames?: string[];
    reservable?: boolean;
  } | null;
  selectedPhotoUrl: string | null;
  menuCorpus: string | null;
  reservation: {
    reservable: boolean;
    bookingUrl: string | null;
    website: string | null;
    hoursSummary: string | null;
  } | null;
  nearbyAlternatives: Array<{
    name: string;
    address?: string;
    rating?: number;
    priceLevel?: string;
    mapsUrl?: string;
  }>;
  costEstimate: string;
  wardrobeContext: {
    ownedPieces: Array<{
      category: string;
      color: string | null;
      formality: string | null;
      description: string;
      activityTags: string[];
    }>;
    gaps: string[];
    summary: string;
  } | null;
  sourcingResults: Array<{
    gap: string;
    options: Array<{
      title: string;
      price: string | null;
      link: string | null;
      source: string | null;
      rating: number | null;
    }>;
  }>;
};

async function buildSupplementalContext(
  item: IndexedItem,
  chatContext?: PlanChatContext,
  userId?: string,
): Promise<PlanSupplementalContext> {
  const [weatherResult, placeResult, alternativesResult] = await Promise.allSettled([
    fetchWeatherForTiming(chatContext?.timingHint, item),
    enrichPlaceFromGooglePlaces(item),
    findNearbyAlternatives(item),
  ]);
  const placeDetails = placeResult.status === "fulfilled" ? placeResult.value : null;
  const photoNames = placeDetails?.photoNames ?? [];
  const selectedPhotoUrl = photoNames.length
    ? await pickBestVenuePhoto({
        photoNames,
        venueName: item.title,
        category: item.category ?? "places",
      }).catch(() => null)
    : null;
  const [reservation, menuCorpus] = await Promise.all([
    resolveReservation(item, placeDetails).catch(() => null),
    gatherMenuCorpus(item, placeDetails).catch(() => null),
  ]);

  // Wardrobe context — only for plans with a clear formality signal AND a
  // known owner id (background plan fill has no session, so userId is threaded
  // through explicitly). Skips gracefully to null otherwise.
  const planFormality = inferFormality(item);
  const wardrobeContext =
    planFormality && userId
      ? await queryWardrobeForEvent({
          userId,
          formality: planFormality,
          activityTag: inferActivityTag(item),
          season: currentSeason(),
        }).catch(() => null)
      : null;

  // Source gaps if the wardrobe agent found any.
  const sourcingResults = wardrobeContext?.gaps.length
    ? await sourceWardrobeGaps({
        gaps: wardrobeContext.gaps,
        formality: planFormality ?? "casual",
        activityTag: inferActivityTag(item),
      }).catch(() => [])
    : [];

  return {
    weather: weatherResult.status === "fulfilled" ? weatherResult.value : null,
    placeDetails,
    selectedPhotoUrl,
    menuCorpus,
    reservation,
    nearbyAlternatives:
      alternativesResult.status === "fulfilled" ? alternativesResult.value : [],
    costEstimate: costEstimateForItem(item, chatContext?.partySize),
    wardrobeContext,
    sourcingResults,
  };
}

function inferFormality(
  item: IndexedItem,
): "casual" | "smart-casual" | "business" | "formal" | null {
  const tags = new Set(item.tags.map((t) => t.toLowerCase()));
  if (tags.has("fine-dining") || tags.has("formal") || item.type === "event")
    return "smart-casual";
  if (tags.has("casual") || item.type === "place") return "casual";
  if (item.type === "restaurant") return "smart-casual";
  return null; // skip wardrobe for products, ideas, etc.
}

function inferActivityTag(item: IndexedItem): string | undefined {
  const tags = new Set(item.tags.map((t) => t.toLowerCase()));
  if (tags.has("golf")) return "golf";
  if (tags.has("outdoor") || tags.has("riding")) return "outdoor";
  if (item.type === "restaurant" || tags.has("dining")) return "dining";
  return undefined;
}

function currentSeason(): string {
  const month = new Date().getMonth();
  if (month >= 2 && month <= 4) return "spring";
  if (month >= 5 && month <= 7) return "summer";
  if (month >= 8 && month <= 10) return "fall";
  return "winter";
}

async function fetchWeatherForTiming(
  timingHint: string | undefined,
  item: IndexedItem,
): Promise<PlanSupplementalContext["weather"]> {
  if (!timingHint || item.lat == null || item.lng == null) return null;
  const targetDate = parseTimingDate(timingHint);
  if (!targetDate) return null;
  const daysOut = Math.floor((startOfDay(targetDate).getTime() - startOfDay(new Date()).getTime()) / 86_400_000);
  if (daysOut < 0 || daysOut > 15) return null;

  const forecast = await getDailyForecast({ lat: item.lat, lng: item.lng, days: Math.max(daysOut + 1, 1) });
  const date = toDateKey(targetDate);
  const idx = forecast.dates.indexOf(date);
  if (idx === -1) return null;
  return {
    date,
    highF: Math.round(forecast.highF[idx]),
    lowF: Math.round(forecast.lowF[idx]),
    precipitationProbability: forecast.precipitationProbability[idx],
    weather: weatherWord(forecast.weatherCode[idx]),
  };
}

async function enrichPlaceFromGooglePlaces(
  item: IndexedItem,
): Promise<PlanSupplementalContext["placeDetails"]> {
  if (!hasGooglePlaces() || (!needsPlaceEnrichment(item) && !isDiningReservationCandidate(item))) return null;
  const query = [item.title, item.locationName, item.address].filter(Boolean).join(" ");
  if (!query.trim()) return null;
  const place = await searchPlaceForEnrichment({
    query,
    lat: item.lat,
    lng: item.lng,
  });
  if (!place) return null;
  return {
    name: place.displayName?.text,
    address: place.formattedAddress ?? place.shortFormattedAddress,
    rating: place.rating,
    userRatingCount: place.userRatingCount,
    priceLevel: place.priceLevel,
    website: place.websiteUri,
    mapsUrl: place.googleMapsUri,
    hoursSummary: place.regularOpeningHours?.weekdayDescriptions?.join(" | "),
    summary: place.editorialSummary?.text,
    photoNames: place.photos?.map((photo) => photo.name).filter(Boolean) ?? [],
    reservable: place.reservable,
  };
}

function isDiningReservationCandidate(item: IndexedItem): boolean {
  return (
    item.type === "restaurant" ||
    item.category === "dining" ||
    item.tags.some((tag) =>
      ["dining", "restaurant", "bar"].includes(tag.toLowerCase()),
    )
  );
}

function isDiningMenuCandidate(item: IndexedItem): boolean {
  return (
    item.type === "restaurant" ||
    item.category === "dining" ||
    item.tags.some((tag) =>
      ["dining", "restaurant"].includes(tag.toLowerCase()),
    )
  );
}

async function gatherMenuCorpus(
  item: IndexedItem,
  placeDetails: PlanSupplementalContext["placeDetails"],
): Promise<string | null> {
  if (!isDiningMenuCandidate(item) || !hasTavily()) return null;

  const website = placeDetails?.website ?? item.url ?? null;
  let corpus = "";

  if (website) {
    const extracted = await extractUrls({ urls: [website] }).catch(() => null);
    corpus =
      extracted?.results?.[0]?.rawContent ??
      extracted?.results?.[0]?.content ??
      "";
  }

  if (corpus.length < 200) {
    const res = await searchWeb({
      query: `${item.title} menu what to order best dishes`,
      maxResults: 3,
    }).catch(() => null);
    corpus = [
      res?.answer ?? "",
      ...(res?.results ?? []).map((result) => result.content),
    ].join(" ");
  }

  corpus = corpus.trim();
  if (corpus.length < 120) return null;
  return corpus.length > 4000 ? corpus.slice(0, 4000) : corpus;
}

async function resolveReservation(
  item: IndexedItem,
  placeDetails: PlanSupplementalContext["placeDetails"],
): Promise<PlanSupplementalContext["reservation"]> {
  if (!isDiningReservationCandidate(item)) return null;

  const reservable = Boolean(placeDetails?.reservable);
  const website = placeDetails?.website ?? null;

  let bookingUrl: string | null = null;
  if (hasTavily()) {
    const res = await searchWeb({
      query: `${item.title} reservation booking`,
      maxResults: 3,
      includeDomains: [
        "opentable.com",
        "resy.com",
        "exploretock.com",
        "sevenrooms.com",
      ],
    }).catch(() => null);
    bookingUrl = res?.results?.[0]?.url ?? null;
  }
  if (!bookingUrl) bookingUrl = website;

  return {
    reservable,
    bookingUrl,
    website,
    hoursSummary: placeDetails?.hoursSummary ?? null,
  };
}

async function findNearbyAlternatives(
  item: IndexedItem,
): Promise<PlanSupplementalContext["nearbyAlternatives"]> {
  if (!hasGooglePlaces() || item.lat == null || item.lng == null) return [];
  const places = await nearbyPlaces({
    lat: item.lat,
    lng: item.lng,
    radiusMeters: 1_500,
    maxResults: 6,
    includedTypes: includedTypesForItem(item),
  });
  const canonical = canonicalTitle(item.title);
  return places
    .filter((place) => canonicalTitle(place.displayName?.text ?? "") !== canonical)
    .slice(0, 3)
    .map((place) => ({
      name: place.displayName?.text ?? "Nearby option",
      address: place.shortFormattedAddress ?? place.formattedAddress,
      rating: place.rating,
      priceLevel: place.priceLevel,
      mapsUrl: place.googleMapsUri,
    }));
}

function needsPlaceEnrichment(item: IndexedItem): boolean {
  if (!["restaurant", "place", "event", "culture"].includes(item.type)) return false;
  const raw = isRecord(item.rawPayload) ? item.rawPayload : {};
  return !item.address || !stringValue(raw.hours_summary) || !stringValue(raw.price_level);
}

function includedTypesForItem(item: IndexedItem): string[] | undefined {
  if (item.type === "restaurant") return ["restaurant"];
  if (item.type === "culture" || item.type === "event") return ["performing_arts_theater"];
  return undefined;
}

function costEstimateForItem(item: IndexedItem, partySize?: number): string {
  const raw = isRecord(item.rawPayload) ? item.rawPayload : {};
  const price = stringValue(raw.price_level) ?? stringValue(raw.priceLevel);
  const perPerson =
    price === "$" || price === "PRICE_LEVEL_INEXPENSIVE" ? "$20-40/person" :
    price === "$$" || price === "PRICE_LEVEL_MODERATE" ? "$40-80/person" :
    price === "$$$" || price === "PRICE_LEVEL_EXPENSIVE" ? "$80-150/person" :
    price === "$$$$" || price === "PRICE_LEVEL_VERY_EXPENSIVE" ? "$150+/person" :
    price === "PRICE_LEVEL_FREE" ? "free" :
    item.type === "restaurant" ? "$40-80/person until confirmed" :
    item.type === "event" ? "ticket cost unknown until confirmed" :
    item.type === "product" || item.type === "style" ? "purchase cost unknown until verified" :
    "cost unknown until confirmed";
  if (!partySize || partySize <= 1 || perPerson === "free") return perPerson;
  return `${perPerson}; party of ${partySize}, so multiply before committing.`;
}

function parseTimingDate(timingHint: string): Date | null {
  const lower = timingHint.toLowerCase();
  const today = startOfDay(new Date());

  if (/\btoday\b|\btonight\b/.test(lower)) return today;
  if (/\btomorrow\b/.test(lower)) {
    const next = new Date(today);
    next.setDate(next.getDate() + 1);
    return next;
  }
  if (/\b(this|next) weekend\b/.test(lower)) {
    const next = new Date(today);
    const saturday = 6;
    const delta = (saturday - today.getDay() + 7) % 7 || 7;
    next.setDate(next.getDate() + (lower.includes("next weekend") ? delta + 7 : delta));
    return next;
  }

  const weekday = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ].findIndex((day) => lower.includes(day));
  if (weekday >= 0) {
    const next = new Date(today);
    const delta = (weekday - today.getDay() + 7) % 7 || 7;
    next.setDate(next.getDate() + delta);
    return next;
  }

  const iso = lower.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1];
  if (iso) {
    const parsed = new Date(`${iso}T12:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function weatherWord(code: number): string {
  if (code === 0) return "Clear";
  if (code <= 3) return "Partly cloudy";
  if (code <= 48) return "Fog";
  if (code <= 67) return "Rain";
  if (code <= 77) return "Snow";
  if (code <= 82) return "Showers";
  if (code <= 86) return "Snow showers";
  return "Storms";
}

function canonicalTitle(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

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

/**
 * Detects the plan's shape based on the source item's type and source.
 * Shape determines the plan page template and what the Provisioner builds.
 *
 * experience  — you're going somewhere / doing something (default)
 * occasion    — someone else's life event, your role is contribution
 * acquisition — you need something specific, output is a sourcing brief
 * touchpoint  — relationship maintenance, output is a suggested move
 */
export function detectPlanShape(item: IndexedItem): PlanShape {
  // Relationship updates from Circle → occasion or touchpoint
  if (item.type === "relationship_update") {
    const tags = new Set(item.tags.map((t) => t.toLowerCase()));
    const category = (item.category ?? "").toLowerCase();
    // Birthday, party, milestone → occasion (has a specific event to attend/contribute to)
    if (
      tags.has("birthday") ||
      tags.has("party") ||
      tags.has("milestone") ||
      category.includes("birthday") ||
      category.includes("occasion")
    ) {
      return "occasion";
    }
    // General relationship signal → touchpoint
    return "touchpoint";
  }

  // Products and gift-type items → acquisition
  if (item.type === "product") return "acquisition";

  // Calendar-sourced person events → occasion
  if (item.source === "contacts" || item.source === "calendar") {
    const title = item.title.toLowerCase();
    if (
      title.includes("birthday") ||
      title.includes("party") ||
      title.includes("anniversary") ||
      title.includes("wedding") ||
      title.includes("graduation")
    ) {
      return "occasion";
    }
  }

  // Everything else — restaurant, event, place, culture, style, etc. → experience
  return "experience";
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
