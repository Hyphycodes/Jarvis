import "server-only";

import { hasAnthropic } from "@/lib/ai/anthropic";
import { generateStructured } from "@/lib/ai/structured";
import { buildBrainContext } from "@/lib/brain/context";
import { buildInterestGraph } from "@/lib/brain/interestGraph";
import { runTasteStrategist } from "@/lib/brain/tasteStrategist";
import { buildScoutMissions, isChicagoLike, type ScoutMission } from "@/lib/brain/scoutMissions";
import {
  buildContextTraceSummary,
  safeWriteIntelligenceTrace,
} from "@/lib/brain/intelligenceTrace";
import {
  buildIntelligenceReason,
  sourceStrengthFromConfidence,
} from "@/lib/brain/intelligenceReason";
import { hasTavily, searchWeb, extractUrls } from "@/lib/sources/tavily";
import { upsertCandidateInboxItem } from "@/lib/radar/candidateInbox";
import { upsertSourceFromLibraryEntity } from "@/lib/library/sourceGraph";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── Types ────────────────────────────────────────────────────────────────────

export type ScoutPlace = {
  name: string;
  type_guess:
    | "restaurant"
    | "bar"
    | "venue"
    | "shop"
    | "hotel"
    | "cultural"
    | "ritual"
    | "outdoor"
    | "unknown";
  snippet: string;
  neighborhood_hint: string | null;
};

type ScoutExtractionResult = {
  places: ScoutPlace[];
};

// ── Query pool ────────────────────────────────────────────────────────────────

const SCOUT_SEEDS: Array<{ q: string; domains: string[]; chicagoOnly?: boolean }> = [
  // Food & Dining
  { q: "best new restaurants {city} {year}", domains: ["chicago.eater.com", "theinfatuation.com", "chicagomag.com"] },
  { q: "best steakhouses {city}", domains: ["theinfatuation.com", "chicago.eater.com", "chicagomag.com"] },
  { q: "best omakase {city}", domains: ["chicago.eater.com", "theinfatuation.com", "timeout.com"] },
  { q: "best chef table private dining {city}", domains: ["chicago.eater.com", "chicagomag.com", "theinfatuation.com"] },
  { q: "best Korean BBQ {city}", domains: ["chicago.eater.com", "theinfatuation.com", "timeout.com"] },
  { q: "best Italian restaurants {city}", domains: ["chicago.eater.com", "theinfatuation.com", "chicagomag.com"] },
  { q: "best sushi {city}", domains: ["chicago.eater.com", "theinfatuation.com", "timeout.com"] },
  { q: "best late night food {city}", domains: ["chicago.eater.com", "theinfatuation.com", "timeout.com"] },
  { q: "best brunch {city}", domains: ["theinfatuation.com", "chicago.eater.com", "timeout.com"] },
  { q: "best tasting menu {city}", domains: ["chicago.eater.com", "chicagomag.com", "theinfatuation.com"] },
  { q: "Michelin starred restaurants {city}", domains: ["chicago.eater.com", "chicagomag.com", "timeout.com"] },
  { q: "James Beard nominated chefs {city}", domains: ["chicago.eater.com", "chicagomag.com"] },
  { q: "{city} heatmap dining", domains: ["chicago.eater.com", "theinfatuation.com", "timeout.com"] },
  { q: "{city} chef collaboration dinner", domains: ["chicago.eater.com", "chicagomag.com"] },
  { q: "{city} hotel restaurant new", domains: ["chicago.eater.com", "theinfatuation.com", "chicagomag.com"] },
  // Bars & Nightlife
  { q: "best cigar lounges cigar bars {city}", domains: ["chicagomag.com", "timeout.com", "chicago.eater.com"] },
  { q: "best speakeasy hidden bars {city}", domains: ["theinfatuation.com", "chicagomag.com", "timeout.com"] },
  { q: "best rooftop bars {city}", domains: ["timeout.com", "theinfatuation.com", "chicagomag.com"] },
  { q: "best jazz clubs live music {city}", domains: ["chicagoreader.com", "timeout.com", "chicagomag.com"] },
  { q: "best mezcal tequila bars {city}", domains: ["theinfatuation.com", "chicago.eater.com", "timeout.com"] },
  { q: "best whiskey bars {city}", domains: ["theinfatuation.com", "chicagomag.com", "timeout.com"] },
  { q: "best wine bars {city}", domains: ["chicago.eater.com", "theinfatuation.com", "timeout.com"] },
  { q: "best cocktail bars {city}", domains: ["theinfatuation.com", "timeout.com", "chicagomag.com"] },
  { q: "best supper clubs {city}", domains: ["chicagomag.com", "timeout.com", "chicagoreader.com"] },
  { q: "best late night bars {city}", domains: ["theinfatuation.com", "timeout.com", "chicagoreader.com"] },
  { q: "best listening bars {city}", domains: ["ra.co", "chicagoreader.com", "timeout.com"] },
  { q: "{city} natural wine bar", domains: ["chicago.eater.com", "theinfatuation.com"] },
  { q: "{city} hidden gem bar", domains: ["chicagomag.com", "chicagoreader.com", "theinfatuation.com"] },
  // Experiences & Culture
  { q: "best live music venues {city}", domains: ["chicagoreader.com", "timeout.com", "ra.co"] },
  { q: "best art galleries {city}", domains: ["timeout.com", "chicagomag.com", "choosechicago.com"] },
  { q: "best barbershops grooming {city}", domains: ["timeout.com", "chicagomag.com"] },
  { q: "best menswear boutiques {city}", domains: ["timeout.com", "gq.com", "monocle.com"] },
  { q: "best sneaker shops {city}", domains: ["timeout.com", "chicagomag.com"] },
  { q: "best record stores {city}", domains: ["chicagoreader.com", "timeout.com"] },
  { q: "best hotel bars {city}", domains: ["theinfatuation.com", "timeout.com", "chicagomag.com"] },
  { q: "best rooftop experiences {city}", domains: ["timeout.com", "theinfatuation.com"] },
  { q: "unique experiences {city} hidden gems", domains: ["timeout.com", "chicagomag.com", "choosechicago.com"] },
  { q: "{city} house music venue", domains: ["ra.co", "chicagoreader.com"] },
  { q: "{city} jazz residency", domains: ["chicagoreader.com", "ra.co", "timeout.com"] },
  { q: "{city} listening bar", domains: ["ra.co", "chicagoreader.com", "timeout.com"] },
  { q: "{city} design boutique store", domains: ["timeout.com", "choosechicago.com", "monocle.com"] },
  // Sports & Tailgate
  { q: "best sports bars {city}", domains: ["timeout.com", "chicagomag.com", "theinfatuation.com"] },
  { q: "best tailgate spots Guaranteed Rate Field White Sox", domains: ["chicagomag.com", "timeout.com"], chicagoOnly: true },
  { q: "best wings {city}", domains: ["theinfatuation.com", "timeout.com", "chicago.eater.com"] },
  { q: "best BBQ {city}", domains: ["theinfatuation.com", "chicago.eater.com", "timeout.com"] },
];

// ── Curated list URLs ─────────────────────────────────────────────────────────
// Specific guide pages rotated into the extraction pool alongside search results.

const SCOUT_URLS: string[] = [
  "https://chicago.eater.com/maps/best-cigar-bars-lounges-chicago",
  "https://www.theinfatuation.com/chicago/guides/best-steakhouses-chicago",
  "https://www.theinfatuation.com/chicago/guides/best-bars-chicago",
  "https://www.theinfatuation.com/chicago/guides/best-new-restaurants-chicago",
  "https://chicago.eater.com/maps/best-omakase-chicago",
  "https://chicago.eater.com/maps/best-late-night-restaurants-chicago",
  "https://www.timeout.com/chicago/bars/best-rooftop-bars-chicago",
  "https://www.timeout.com/chicago/bars/best-cocktail-bars-chicago",
  "https://www.timeout.com/chicago/bars/best-jazz-clubs-chicago",
  "https://www.chicagomag.com/dining-and-drinking/best-new-restaurants-chicago",
  "https://chicago.eater.com/maps/best-wine-bars-chicago",
  "https://chicago.eater.com/maps/best-sushi-chicago",
  "https://chicago.eater.com/maps/best-italian-restaurants-chicago",
  "https://www.theinfatuation.com/chicago/guides/best-cocktail-bars-chicago",
  "https://chicago.eater.com/maps/michelin-star-restaurants-chicago",
];

// ── Extraction system prompt ──────────────────────────────────────────────────

const SCOUT_SYSTEM_PROMPT = `You are Jarvis's SCOUT. Your job is to extract named places (restaurants, bars, lounges, venues, shops, hotels, cultural spaces) from an article about {city}.

RULES
- Only extract specific named entities — actual venue names. Not "the West Loop" or "the new Korean spot" (unnamed).
- Skip chains, hotel restaurants only mentioned in passing, and places mentioned only to be dismissed.
- For each place, include the one-sentence quote/snippet that describes it from the article.
- Skip places that aren't physically in or adjacent to {city}.

Return strict JSON:
{
  "places": [
    {
      "name": "string",
      "type_guess": "restaurant" | "bar" | "venue" | "shop" | "hotel" | "cultural" | "ritual" | "outdoor" | "unknown",
      "snippet": "string",
      "neighborhood_hint": "string or null"
    }
  ]
}`;

// ── Slug helper ───────────────────────────────────────────────────────────────

function makeSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ── Random selection ──────────────────────────────────────────────────────────

function pickUrls(count: number): string[] {
  const shuffled = [...SCOUT_URLS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function scoutSystemPrompt(city: string): string {
  return SCOUT_SYSTEM_PROMPT.replace(/\{city\}/g, city);
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function runScout(
  userId: string,
): Promise<{
  articles_processed: number;
  candidates_added: number;
  duplicates_skipped: number;
  sources_added: number;
}> {
  const supabase = getSupabaseServiceClient();

  let articles_processed = 0;
  let candidates_added = 0;
  let duplicates_skipped = 0;
  let sources_added = 0;

  if (!hasTavily()) {
    console.warn("[scout] TAVILY_API_KEY not set — skipping Scout run");
    return { articles_processed, candidates_added, duplicates_skipped, sources_added };
  }

  const brainContext = await buildBrainContext({ userId, includeWeather: false, supabase });
  const city = brainContext.homeCity?.trim();
  if (!city) {
    console.warn("[scout] No profile home city — skipping Scout run");
    return { articles_processed, candidates_added, duplicates_skipped, sources_added };
  }
  const year = new Date(brainContext.now).getFullYear();
  const graph = buildInterestGraph({ context: brainContext });
  const inventory = await readScoutInventory(userId, supabase);
  const strategist = await runTasteStrategist({
    context: brainContext,
    graph,
    activeRadarCount: inventory.activeRadar,
    holdingCount: inventory.holding,
  });
  const missions = buildScoutMissions({
    lanes: strategist.output.lanes,
    city,
    year,
    staticSeeds: SCOUT_SEEDS,
    allowStaticFallback: strategist.fallbackUsed,
    minMissionCount: 4,
  });
  const chicagoContext = isChicagoLike(city);
  if (missions.length === 0) {
    console.warn("[scout] No valid strategist missions — skipping Scout run");
    await safeWriteIntelligenceTrace({
      userId,
      route: "lib/brain/scout.runScout",
      surface: "scout",
      decisionType: "mission_skipped",
      contextSummary: buildContextTraceSummary(brainContext),
      reasoning: buildIntelligenceReason({
        summary: "Scout skipped because no mission cleared the strategist/context gate.",
        contextFactors: [strategist.output.notes, strategist.reason],
      }),
      candidatesConsidered: [],
      outcome: "skipped_no_missions",
    });
    return { articles_processed, candidates_added, duplicates_skipped, sources_added };
  }

  // Curated URLs are Chicago-only seed material and remain subordinate to
  // strategist missions. They are used only when a static seed mission is active.
  const urls = chicagoContext && missions.some((mission) => mission.seed)
    ? pickUrls(2)
    : [];

  // Collect all articles from all queries
  const articleMap = new Map<string, { title: string; content: string; url: string }>();

  for (const mission of missions) {
    for (const query of mission.queryIdeas.slice(0, 3)) {
      try {
        const res = await searchWeb({
          query,
          maxResults: 5,
          days: 90,
          includeDomains: chicagoContext ? mission.domains : undefined,
        });
        for (const r of res.results) {
          if (!articleMap.has(r.url)) {
            articleMap.set(r.url, { title: r.title, url: r.url, content: r.content });
          }
        }
      } catch (err) {
        console.warn("[scout] Tavily mission query failed", {
          missionId: mission.id,
          query,
          err,
        });
      }
    }
  }

  // Extract content from curated list URLs
  if (urls.length > 0) {
    try {
      const extracted = await extractUrls({ urls });
      for (const r of extracted.results) {
        if (r.url && !articleMap.has(r.url)) {
          articleMap.set(r.url, {
            title: r.url,
            url: r.url,
            content: (r.rawContent ?? r.content ?? "").slice(0, 3000),
          });
        }
      }
    } catch (err) {
      console.warn("[scout] URL extraction failed", { urls, err });
    }
  }

  const articles = Array.from(articleMap.values());
  articles_processed = articles.length;
  sources_added = await seedSourcesFromArticles({
    userId,
    city,
    articles,
    supabase,
    missionIds: missions.map((mission) => mission.id),
  });

  if (!hasAnthropic()) {
    console.warn("[scout] No Anthropic key — skipping extraction, articles logged only");
    console.warn("[scout] Articles found:", articles.map((a) => a.url));
    await traceScoutRun({
      userId,
      context: brainContext,
      missions,
      articlesProcessed: articles_processed,
      candidatesAdded: candidates_added,
      duplicatesSkipped: duplicates_skipped,
      outcome: "articles_found_extraction_skipped",
      strategistFallbackUsed: strategist.fallbackUsed,
    });
    return { articles_processed, candidates_added, duplicates_skipped, sources_added };
  }

  // Prefetch existing slugs for dedup (both tables)
  const [libRes, candRes] = await Promise.all([
    supabase
      .from("places_library")
      .select("slug")
      .eq("user_id", userId),
    supabase
      .from("place_candidates")
      .select("name")
      .eq("user_id", userId),
  ]);

  const existingSlugs = new Set<string>(
    (libRes.data ?? []).map((r) => r.slug as string),
  );
  const existingCandidateNames = new Set<string>(
    (candRes.data ?? []).map((r) => makeSlug(r.name as string)),
  );

  // Extract places from each article
  for (const article of articles) {
    try {
      const prompt = JSON.stringify({
        article_title: article.title,
        article_url: article.url,
        article_content: article.content.slice(0, 1500),
        instructions: [
          `Extract all named ${city} places from this article.`,
          "Return strict JSON matching the ScoutExtractionResult schema.",
        ],
      });

      const result = await generateStructured<ScoutExtractionResult>({
        system: scoutSystemPrompt(city),
        prompt,
        schemaName: "ScoutExtractionResult",
        temperature: 0.1,
        maxTokens: 1024,
      });

      const places = result?.places ?? [];

      for (const place of places) {
        if (!place.name?.trim()) continue;

        const slug = makeSlug(place.name);

        // Dedup check
        if (existingSlugs.has(slug) || existingCandidateNames.has(slug)) {
          duplicates_skipped++;
          continue;
        }

        // Insert into place_candidates
        const { error } = await supabase.from("place_candidates").insert({
          user_id: userId,
          name: place.name.trim(),
          discovered_via: article.url,
          status: "pending",
          quick_classification: place.type_guess,
          notes: place.snippet ?? null,
        });

        if (error) {
          console.warn("[scout] Failed to insert candidate", {
            name: place.name,
            error: error.message,
          });
        } else {
          existingCandidateNames.add(slug);
          candidates_added++;
        }
      }
    } catch (err) {
      // Best-effort — never crash the cron run
      console.warn("[scout] Extraction failed for article", {
        url: article.url,
        err,
      });
    }
  }

  console.warn("[scout] Run complete", {
    articles_processed,
    candidates_added,
    duplicates_skipped,
  });
  await traceScoutRun({
    userId,
    context: brainContext,
    missions,
    articlesProcessed: articles_processed,
    candidatesAdded: candidates_added,
    duplicatesSkipped: duplicates_skipped,
    outcome: "completed",
    strategistFallbackUsed: strategist.fallbackUsed,
  });

  return { articles_processed, candidates_added, duplicates_skipped, sources_added };
}

async function seedSourcesFromArticles(input: {
  userId: string;
  city: string;
  articles: Array<{ title: string; content: string; url: string }>;
  missionIds: string[];
  supabase: SupabaseClient;
}): Promise<number> {
  let sourcesAdded = 0;
  for (const article of input.articles.slice(0, 40)) {
    const sourceId = await upsertSourceFromLibraryEntity({
      userId: input.userId,
      title: article.title,
      url: article.url,
      entityType: "source",
      qualityScore: 0.52,
      topics: ["scout", "bootstrap", input.city],
      supabase: input.supabase,
    });
    if (sourceId) {
      sourcesAdded++;
      await upsertCandidateInboxItem({
        userId: input.userId,
        title: article.title,
        description: article.content.slice(0, 500),
        url: article.url,
        entityType: "source",
        sourceId,
        rawPayload: {
          source: "scout_article",
          mission_ids: input.missionIds,
          city: input.city,
        },
        score: 0.52,
        reason: {
          summary: "Real provider result captured as a source candidate for bootstrap evaluation.",
        },
        supabase: input.supabase,
      });
    }
  }
  return sourcesAdded;
}

async function readScoutInventory(
  userId: string,
  supabase: SupabaseClient,
): Promise<{ activeRadar: number; holding: number }> {
  const [activeRes, holdingRes] = await Promise.all([
    supabase
      .from("surfaced_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("destination", "radar")
      .in("status", ["shown", "opened"]),
    supabase
      .from("surfaced_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("destination", "holding")
      .in("status", ["discovered", "shown"]),
  ]);
  return {
    activeRadar: activeRes.count ?? 0,
    holding: holdingRes.count ?? 0,
  };
}

async function traceScoutRun(input: {
  userId: string;
  context: Awaited<ReturnType<typeof buildBrainContext>>;
  missions: ScoutMission[];
  articlesProcessed: number;
  candidatesAdded: number;
  duplicatesSkipped: number;
  outcome: string;
  strategistFallbackUsed: boolean;
}) {
  const topMission = input.missions[0];
  await safeWriteIntelligenceTrace({
    userId: input.userId,
    route: "lib/brain/scout.runScout",
    surface: "scout",
    decisionType: "mission_execution",
    contextSummary: buildContextTraceSummary(input.context),
    reasoning: buildIntelligenceReason({
      summary: topMission
        ? `Scout executed ${input.missions.length} strategist mission${input.missions.length === 1 ? "" : "s"}.`
        : "Scout had no executable mission.",
      contextFactors: input.missions.slice(0, 5).map((mission) => mission.contextReason),
      sourceStrength: sourceStrengthFromConfidence(topMission?.confidence),
      confidence: topMission?.confidence,
    }),
    candidatesConsidered: input.missions.map((mission) => ({
      id: mission.id,
      lane: mission.lane,
      intent: mission.intent,
      queries: mission.queryIdeas,
      seed: Boolean(mission.seed),
    })),
    selectedCandidate: topMission
      ? {
          id: topMission.id,
          intent: topMission.intent,
          destination: topMission.destination,
        }
      : null,
    sourceQuality: {
      articles_processed: input.articlesProcessed,
      candidates_added: input.candidatesAdded,
      duplicates_skipped: input.duplicatesSkipped,
      strategist_fallback_used: input.strategistFallbackUsed,
    },
    confidence: topMission?.confidence ?? null,
    outcome: input.outcome,
  });
}
