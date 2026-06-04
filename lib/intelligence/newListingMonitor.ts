import "server-only";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { hasTavily, searchWeb } from "@/lib/sources/tavily";
import { hasAnthropic } from "@/lib/ai/anthropic";
import { generateStructured } from "@/lib/ai/structured";
import type { ScoutPlace } from "@/lib/brain/scout";

function makeSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

type ExtractionResult = { places: ScoutPlace[] };

const SYSTEM = `You are extracting newly opened Chicago establishments from search results.

Extract only places that appear to have opened in the last 60 days. Look for language like "new", "opening", "just opened", "now open", "grand opening", "coming soon", "soft open".

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
}

Rules:
- Only named, specific establishments (not "a new Italian spot")
- Skip chains and franchises
- Skip places without a clear new-opening signal
- Return empty places array if nothing qualifies`;

// Neighborhoods and categories to probe for new openings
const NEW_LISTING_QUERIES = [
  "new restaurant opening Chicago 2025",
  "new bar opening Chicago 2025",
  "new restaurant West Loop Chicago",
  "new restaurant River North Chicago",
  "new restaurant Logan Square Chicago",
  "new wine bar Chicago opening",
  "new omakase Chicago opening",
  "Chicago grand opening restaurant bar 2025",
];

export async function runNewListingMonitor(userId: string): Promise<{
  queries_run: number;
  candidates_added: number;
  duplicates_skipped: number;
}> {
  const summary = { queries_run: 0, candidates_added: 0, duplicates_skipped: 0 };

  if (!hasTavily() || !hasAnthropic()) return summary;

  const supabase = getSupabaseServiceClient();

  // Pre-fetch dedup sets
  const [libRes, candRes] = await Promise.all([
    supabase.from("places_library").select("slug").eq("user_id", userId),
    supabase.from("place_candidates").select("name").eq("user_id", userId),
  ]);
  const existingSlugs = new Set((libRes.data ?? []).map((r) => r.slug as string));
  const existingNames = new Set(
    (candRes.data ?? []).map((r) => makeSlug(r.name as string)),
  );

  // Run a subset of queries each time (rotate to avoid rate limits)
  const dayOfWeek = new Date().getDay();
  const queryBatch = NEW_LISTING_QUERIES.filter((_, i) => i % 3 === dayOfWeek % 3);

  for (const query of queryBatch) {
    summary.queries_run++;
    try {
      const res = await searchWeb({ query, days: 30, maxResults: 8 });
      const content = res.results
        .map((r) => `${r.title}\n${r.content}`)
        .join("\n\n")
        .slice(0, 4000);

      if (!content.trim()) continue;

      const result = await generateStructured<ExtractionResult>({
        system: SYSTEM,
        prompt: JSON.stringify({ query, content }),
        schemaName: "ExtractionResult",
        temperature: 0.1,
        maxTokens: 512,
      });

      for (const place of result?.places ?? []) {
        if (!place.name?.trim()) continue;
        const slug = makeSlug(place.name);
        if (existingSlugs.has(slug) || existingNames.has(slug)) {
          summary.duplicates_skipped++;
          continue;
        }
        const { error } = await supabase.from("place_candidates").insert({
          user_id: userId,
          name: place.name.trim(),
          discovered_via: `new-listing:${query}`,
          status: "pending",
          quick_classification: place.type_guess,
          notes: `[new-listing] ${place.snippet ?? ""}`.slice(0, 500),
        });
        if (!error) {
          existingNames.add(slug);
          summary.candidates_added++;
        }
      }
    } catch (err) {
      console.warn("[newListingMonitor] query failed", { query, err });
    }
  }

  return summary;
}
