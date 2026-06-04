import "server-only";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { hasTavily, extractUrls } from "@/lib/sources/tavily";
import { generateStructured } from "@/lib/ai/structured";
import { hasAnthropic } from "@/lib/ai/anthropic";
// ScoutPlace is exported from the Scout; ScoutExtractionResult is not, so
// it's defined locally below. Same shape, same extraction contract.
import type { ScoutPlace } from "@/lib/brain/scout";

type ScoutExtractionResult = {
  places: ScoutPlace[];
};

// Local slug helper — makeSlug is not exported from scout.ts.
function makeSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// The extraction system prompt — same contract as the Scout, reused.
const ARCHIVE_SYSTEM_PROMPT = `You are Jarvis's ARCHIVE MINER. Your job is to extract named places (restaurants, bars, lounges, venues, shops, hotels, cultural spaces) from a curated editorial article.

RULES
- Only extract specific named entities — actual venue names. Not "the West Loop" or "the new Korean spot" (unnamed).
- Skip chains, hotel restaurants only mentioned in passing, and places mentioned only to be dismissed.
- For each place, include the one-sentence quote/snippet that describes it from the article.
- Skip places outside Chicago or the surrounding metro area.

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

export async function runArchiveMiner(userId: string): Promise<{
  sources_checked: number;
  articles_processed: number;
  candidates_added: number;
  duplicates_skipped: number;
}> {
  const summary = {
    sources_checked: 0,
    articles_processed: 0,
    candidates_added: 0,
    duplicates_skipped: 0,
  };

  if (!hasTavily() || !hasAnthropic()) {
    console.warn("[archiveMiner] Tavily or Anthropic not configured — skipping");
    return summary;
  }

  const supabase = getSupabaseServiceClient();
  const now = new Date().toISOString();

  // ── 1. Select sources due for archive mining ──────────────────────────────
  // Sources with trust_score >= 0.65, type = 'publication', status not muted/retired,
  // and next_check_at is null or in the past.
  const { data: sourcesRaw } = await supabase
    .from("intelligence_sources")
    .select("id, source_key, domain, url, trust_score, cadence_hours, topics, name")
    .eq("user_id", userId)
    .eq("source_type", "publication")
    .not("status", "in", '("muted","retired")')
    .gte("trust_score", 0.65)
    .or(`next_check_at.is.null,next_check_at.lte.${now}`)
    .order("trust_score", { ascending: false })
    .limit(5); // max 5 sources per run to stay within time budget

  const sources = (sourcesRaw ?? []) as Array<{
    id: string;
    source_key: string;
    domain: string | null;
    url: string | null;
    trust_score: number;
    cadence_hours: number;
    topics: string[];
    name: string | null;
  }>;

  if (!sources.length) {
    console.log("[archiveMiner] No sources due for archive mining");
    return summary;
  }

  // ── 2. Pre-fetch existing slugs for dedup ─────────────────────────────────
  const [libRes, candRes] = await Promise.all([
    supabase.from("places_library").select("slug").eq("user_id", userId),
    supabase.from("place_candidates").select("name").eq("user_id", userId),
  ]);
  const existingSlugs = new Set<string>(
    (libRes.data ?? []).map((r) => r.slug as string),
  );
  const existingCandidateNames = new Set<string>(
    (candRes.data ?? []).map((r) => makeSlug(r.name as string)),
  );

  // ── 3. Mine each source ───────────────────────────────────────────────────
  for (const source of sources) {
    summary.sources_checked++;

    try {
      // Build the list of archive URLs to mine for this source.
      const archiveUrls = buildArchiveUrls(
        source.domain ?? source.url ?? source.source_key,
      );
      if (!archiveUrls.length) continue;

      // Fetch archive pages in batches of 5 (Tavily extract limit).
      const articleMap = new Map<string, { url: string; content: string }>();
      for (let i = 0; i < Math.min(archiveUrls.length, 15); i += 5) {
        const batch = archiveUrls.slice(i, i + 5);
        try {
          const extracted = await extractUrls({ urls: batch });
          for (const r of extracted.results) {
            if (r.url && !articleMap.has(r.url)) {
              articleMap.set(r.url, {
                url: r.url,
                content: (r.rawContent ?? r.content ?? "").slice(0, 3000),
              });
            }
          }
        } catch (err) {
          console.warn("[archiveMiner] batch extract failed", { batch, err });
        }
      }

      // Extract places from each article.
      for (const [, article] of articleMap) {
        summary.articles_processed++;
        try {
          const result = await generateStructured<ScoutExtractionResult>({
            system: ARCHIVE_SYSTEM_PROMPT,
            prompt: JSON.stringify({
              article_url: article.url,
              article_content: article.content,
              instructions: [
                "Extract all named Chicago places from this article.",
                "Return strict JSON matching the schema.",
              ],
            }),
            schemaName: "ScoutExtractionResult",
            temperature: 0.1,
            maxTokens: 1024,
          });

          const places = result?.places ?? [];
          for (const place of places) {
            if (!place.name?.trim()) continue;
            const slug = makeSlug(place.name);
            if (existingSlugs.has(slug) || existingCandidateNames.has(slug)) {
              summary.duplicates_skipped++;
              continue;
            }
            const { error } = await supabase.from("place_candidates").insert({
              user_id: userId,
              name: place.name.trim(),
              discovered_via: article.url,
              status: "pending",
              quick_classification: place.type_guess,
              notes: `[archive] ${place.snippet ?? ""}`.slice(0, 500),
            });
            if (!error) {
              existingCandidateNames.add(slug);
              summary.candidates_added++;
            }
          }
        } catch (err) {
          console.warn("[archiveMiner] extraction failed", { url: article.url, err });
        }
      }

      // ── 4. Update cadence: set next_check_at based on trust_score ──────────
      // High trust (>= 0.72): mine every 14 days
      // Medium trust (0.65–0.72): mine every 21 days
      const cadenceDays = source.trust_score >= 0.72 ? 14 : 21;
      const nextCheck = new Date();
      nextCheck.setDate(nextCheck.getDate() + cadenceDays);
      await supabase
        .from("intelligence_sources")
        .update({
          last_checked_at: now,
          next_check_at: nextCheck.toISOString(),
          cadence_hours: cadenceDays * 24,
          updated_at: now,
        })
        .eq("id", source.id)
        .eq("user_id", userId);
    } catch (err) {
      console.error("[archiveMiner] source failed", { source: source.source_key, err });
    }
  }

  console.log("[archiveMiner] complete", summary);
  return summary;
}

/**
 * Build archive/category URLs to mine for a given domain.
 * These are the deep-catalog pages that hold historical editorial content.
 * Only known trusted domains get specific archive paths — unknowns get nothing.
 */
function buildArchiveUrls(domain: string): string[] {
  const d = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");

  const ARCHIVE_PATHS: Record<string, string[]> = {
    "chicago.eater.com": [
      "https://chicago.eater.com/maps/best-new-restaurants-chicago",
      "https://chicago.eater.com/maps/best-restaurants-chicago",
      "https://chicago.eater.com/maps/best-bars-chicago",
      "https://chicago.eater.com/maps/best-cocktail-bars-chicago",
      "https://chicago.eater.com/maps/best-wine-bars-chicago",
      "https://chicago.eater.com/maps/best-neighborhoods-chicago-restaurants",
    ],
    "theinfatuation.com": [
      "https://www.theinfatuation.com/chicago/guides/best-new-restaurants-chicago",
      "https://www.theinfatuation.com/chicago/guides/best-restaurants-chicago",
      "https://www.theinfatuation.com/chicago/guides/best-bars-chicago",
      "https://www.theinfatuation.com/chicago/guides/best-date-restaurants-chicago",
      "https://www.theinfatuation.com/chicago/guides/best-neighborhoods-chicago",
    ],
    "chicagomag.com": [
      "https://www.chicagomag.com/dining-and-drinking/best-new-restaurants-chicago",
      "https://www.chicagomag.com/dining-and-drinking/best-restaurants-chicago",
      "https://www.chicagomag.com/dining-and-drinking/best-bars-chicago",
      "https://www.chicagomag.com/city-life/style",
    ],
    "chicagoreader.com": [
      "https://www.chicagoreader.com/chicago/best-of-chicago/BestOf",
      "https://www.chicagoreader.com/chicago/arts-culture/Content",
      "https://www.chicagoreader.com/chicago/food-drink/Content",
    ],
    "timeout.com": [
      "https://www.timeout.com/chicago/restaurants/best-restaurants-in-chicago",
      "https://www.timeout.com/chicago/bars/best-bars-in-chicago",
      "https://www.timeout.com/chicago/things-to-do/best-things-to-do-in-chicago",
    ],
    "gq.com": [
      "https://www.gq.com/story/best-restaurants-in-chicago",
      "https://www.gq.com/story/best-bars-chicago",
      "https://www.gq.com/story/chicago-city-guide",
    ],
    "hodinkee.com": [
      "https://www.hodinkee.com/articles/category/reference",
      "https://www.hodinkee.com/articles/category/watch-advice",
    ],
    "cigaraficionado.com": [
      "https://www.cigaraficionado.com/category/rated-cigars",
      "https://www.cigaraficionado.com/category/humidor",
    ],
    "golfdigest.com": [
      "https://www.golfdigest.com/story/100-greatest-courses-america",
      "https://www.golfdigest.com/golf-courses/illinois",
    ],
  };

  // Match by domain or subdomain.
  for (const [key, urls] of Object.entries(ARCHIVE_PATHS)) {
    if (d === key || d.endsWith(`.${key}`) || d.startsWith(key.replace(/^www\./, ""))) {
      return urls;
    }
  }

  // Unknown domain: no archive paths — skip rather than guess.
  return [];
}
