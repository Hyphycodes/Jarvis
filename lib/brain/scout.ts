import "server-only";

import { hasAnthropic } from "@/lib/ai/anthropic";
import { generateStructured } from "@/lib/ai/structured";
import { buildBrainContext } from "@/lib/brain/context";
import { hasTavily, searchWeb, extractUrls } from "@/lib/sources/tavily";
import { getServerSupabase } from "@/lib/supabase/ssr-server";

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

const SCOUT_QUERIES: Array<{ q: string; domains: string[]; chicagoOnly?: boolean }> = [
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

function pickQueries(
  count: number,
  chicagoLike: boolean,
): Array<{ q: string; domains: string[]; chicagoOnly?: boolean }> {
  const eligible = SCOUT_QUERIES.filter((query) => chicagoLike || !query.chicagoOnly);
  const shuffled = [...eligible].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function pickUrls(count: number): string[] {
  const shuffled = [...SCOUT_URLS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function renderScoutQuery(query: string, city: string, year: number): string {
  return query
    .replace(/\{city\}/g, city)
    .replace(/\{year\}/g, String(year))
    .replace(/\s+/g, " ")
    .trim();
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
}> {
  const supabase = await getServerSupabase();

  let articles_processed = 0;
  let candidates_added = 0;
  let duplicates_skipped = 0;

  if (!hasTavily()) {
    console.warn("[scout] TAVILY_API_KEY not set — skipping Scout run");
    return { articles_processed, candidates_added, duplicates_skipped };
  }

  const brainContext = await buildBrainContext({ userId, includeWeather: false });
  const city = brainContext.homeCity?.trim();
  if (!city) {
    console.warn("[scout] No profile home city — skipping Scout run");
    return { articles_processed, candidates_added, duplicates_skipped };
  }
  const year = new Date(brainContext.now).getFullYear();
  const chicagoLike = /chicago/i.test(city);

  // Pick 6-8 random queries + 2 curated list URLs for this run
  const queryCount = 6 + Math.floor(Math.random() * 3); // 6, 7, or 8
  const queries = pickQueries(queryCount, chicagoLike);
  const urls = chicagoLike ? pickUrls(2) : [];

  // Collect all articles from all queries
  const articleMap = new Map<string, { title: string; content: string; url: string }>();

  for (const { q, domains } of queries) {
    const query = renderScoutQuery(q, city, year);
    try {
      const res = await searchWeb({
        query,
        maxResults: 5,
        days: 90,
        includeDomains: chicagoLike ? domains : undefined,
      });
      for (const r of res.results) {
        if (!articleMap.has(r.url)) {
          articleMap.set(r.url, { title: r.title, url: r.url, content: r.content });
        }
      }
    } catch (err) {
      console.warn("[scout] Tavily query failed", { q: query, err });
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

  if (!hasAnthropic()) {
    console.warn("[scout] No Anthropic key — skipping extraction, articles logged only");
    console.warn("[scout] Articles found:", articles.map((a) => a.url));
    return { articles_processed, candidates_added, duplicates_skipped };
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

  return { articles_processed, candidates_added, duplicates_skipped };
}
