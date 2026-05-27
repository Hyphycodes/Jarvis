import "server-only";

import { hasAnthropic } from "@/lib/ai/anthropic";
import { generateStructured } from "@/lib/ai/structured";
import { hasTavily, searchWeb } from "@/lib/sources/tavily";
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

const SCOUT_QUERIES: Array<{ q: string; domains: string[] }> = [
  {
    q: "best new Chicago restaurants this month",
    domains: ["chicago.eater.com", "theinfatuation.com"],
  },
  {
    q: "Chicago heatmap dining",
    domains: ["chicago.eater.com", "theinfatuation.com", "timeout.com"],
  },
  {
    q: "Chicago hidden gem bar",
    domains: ["chicagomag.com", "chicagoreader.com", "theinfatuation.com"],
  },
  {
    q: "Chicago natural wine bar",
    domains: ["chicago.eater.com", "theinfatuation.com"],
  },
  {
    q: "Chicago listening bar",
    domains: ["ra.co", "chicagoreader.com", "timeout.com"],
  },
  {
    q: "Chicago menswear boutique opening",
    domains: ["gq.com", "esquire.com", "monocle.com"],
  },
  {
    q: "Chicago cigar lounge",
    domains: ["chicagomag.com", "timeout.com"],
  },
  {
    q: "Chicago jazz residency",
    domains: ["chicagoreader.com", "ra.co", "timeout.com"],
  },
  {
    q: "Chicago hotel restaurant new",
    domains: ["chicago.eater.com", "theinfatuation.com", "chicagomag.com"],
  },
  {
    q: "Chicago chef collaboration dinner",
    domains: ["chicago.eater.com", "chicagomag.com"],
  },
  {
    q: "Chicago house music venue",
    domains: ["ra.co", "chicagoreader.com"],
  },
  {
    q: "Chicago steakhouse craft",
    domains: ["theinfatuation.com", "chicago.eater.com", "chicagomag.com"],
  },
  {
    q: "Chicago cocktail bar refined",
    domains: ["theinfatuation.com", "timeout.com", "chicagomag.com"],
  },
  {
    q: "Chicago Italian neighborhood restaurant",
    domains: ["chicago.eater.com", "theinfatuation.com"],
  },
  {
    q: "Chicago design boutique store",
    domains: ["timeout.com", "choosechicago.com", "monocle.com"],
  },
];

// ── Extraction system prompt ──────────────────────────────────────────────────

const SCOUT_SYSTEM_PROMPT = `You are Jarvis's SCOUT. Your job is to extract named places (restaurants, bars, lounges, venues, shops, hotels, cultural spaces) from an article about Chicago.

RULES
- Only extract specific named entities — actual venue names. Not "the West Loop" or "the new Korean spot" (unnamed).
- Skip chains, hotel restaurants only mentioned in passing, and places mentioned only to be dismissed.
- For each place, include the one-sentence quote/snippet that describes it from the article.
- Skip places that aren't physically in or adjacent to Chicago.

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

function pickQueries(count: number): Array<{ q: string; domains: string[] }> {
  const shuffled = [...SCOUT_QUERIES].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
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

  // Pick 4-6 random queries for this run
  const queryCount = 4 + Math.floor(Math.random() * 3); // 4, 5, or 6
  const queries = pickQueries(queryCount);

  // Collect all articles from all queries
  const articleMap = new Map<string, { title: string; content: string; url: string }>();

  for (const { q, domains } of queries) {
    try {
      const res = await searchWeb({
        query: q,
        maxResults: 5,
        days: 30,
        includeDomains: domains,
      });
      for (const r of res.results) {
        if (!articleMap.has(r.url)) {
          articleMap.set(r.url, { title: r.title, url: r.url, content: r.content });
        }
      }
    } catch (err) {
      console.warn("[scout] Tavily query failed", { q, err });
    }
  }

  const articles = Array.from(articleMap.values());
  articles_processed = articles.length;

  if (!hasAnthropic()) {
    console.warn("[scout] No Anthropic key — skipping extraction, articles logged only");
    console.log("[scout] Articles found:", articles.map((a) => a.url));
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
          "Extract all named Chicago places from this article.",
          "Return strict JSON matching the ScoutExtractionResult schema.",
        ],
      });

      const result = await generateStructured<ScoutExtractionResult>({
        system: SCOUT_SYSTEM_PROMPT,
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

  console.log("[scout] Run complete", {
    articles_processed,
    candidates_added,
    duplicates_skipped,
  });

  return { articles_processed, candidates_added, duplicates_skipped };
}
