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

const SYSTEM = `You are extracting Chicago place recommendations from community discussions.

Extract only places where real people are actively recommending them. Look for enthusiasm, specific details, repeat mentions. Skip generic responses and AI-generated content.

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

Return empty places array if no specific places with genuine community enthusiasm are found.`;

const COMMUNITY_QUERIES = [
  { query: "Chicago restaurant recommendation Reddit 2025", domains: ["reddit.com"] },
  { query: "best new restaurant Chicago Reddit", domains: ["reddit.com"] },
  { query: "Chicago hidden gem restaurant bar", domains: ["reddit.com", "yelp.com"] },
  { query: "Chicago food blog new opening 2025", domains: [] }, // open web
  { query: "must try Chicago restaurant neighborhood", domains: ["reddit.com"] },
];

export async function runSocialProofAggregator(userId: string): Promise<{
  queries_run: number;
  candidates_added: number;
  duplicates_skipped: number;
}> {
  const summary = { queries_run: 0, candidates_added: 0, duplicates_skipped: 0 };
  if (!hasTavily() || !hasAnthropic()) return summary;

  const supabase = getSupabaseServiceClient();

  const [libRes, candRes] = await Promise.all([
    supabase.from("places_library").select("slug").eq("user_id", userId),
    supabase.from("place_candidates").select("name").eq("user_id", userId),
  ]);
  const existingSlugs = new Set((libRes.data ?? []).map((r) => r.slug as string));
  const existingNames = new Set(
    (candRes.data ?? []).map((r) => makeSlug(r.name as string)),
  );

  // Run 2 queries per daily run (rotate through the list by day)
  const dayOfMonth = new Date().getDate();
  const startIdx = dayOfMonth % COMMUNITY_QUERIES.length;
  const batch = [
    COMMUNITY_QUERIES[startIdx],
    COMMUNITY_QUERIES[(startIdx + 1) % COMMUNITY_QUERIES.length],
  ];

  for (const { query, domains } of batch) {
    summary.queries_run++;
    try {
      const res = await searchWeb({
        query,
        days: 14, // velocity window: last 2 weeks
        maxResults: 8,
        includeDomains: domains.length > 0 ? domains : undefined,
      });

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
          discovered_via: `community:${domains[0] ?? "web"}`,
          status: "pending",
          quick_classification: place.type_guess,
          notes: `[community-signal] ${place.snippet ?? ""}`.slice(0, 500),
        });
        if (!error) {
          existingNames.add(slug);
          summary.candidates_added++;
        }
      }
    } catch (err) {
      console.warn("[socialProofAggregator] query failed", { query, err });
    }
  }

  return summary;
}
