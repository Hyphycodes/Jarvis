import "server-only";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { hasAnthropic } from "@/lib/ai/anthropic";
import { generateStructured } from "@/lib/ai/structured";
import type { ScoutPlace } from "@/lib/brain/scout";
import type { SupabaseClient } from "@supabase/supabase-js";

function makeSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

type ExtractionResult = { places: ScoutPlace[] };

const SYSTEM = `You are extracting named place mentions from social/personal updates.

Extract only specific named establishments — restaurants, bars, lounges, venues, shops — mentioned by name. Skip vague references ("a great spot", "this place").

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

Return empty places array if no specific named places are mentioned.`;

export async function runNetworkSignalAgent(
  userId: string,
  supabase?: SupabaseClient,
): Promise<{
  updates_scanned: number;
  candidates_added: number;
  duplicates_skipped: number;
}> {
  const summary = { updates_scanned: 0, candidates_added: 0, duplicates_skipped: 0 };
  if (!hasAnthropic()) return summary;

  const db = supabase ?? getSupabaseServiceClient();

  // Fetch recent circle updates (last 30 days)
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const { data: updates } = await db
    .from("circle_updates")
    .select("id, title, summary, suggested_action")
    .eq("user_id", userId)
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(30);

  if (!updates?.length) return summary;

  // Pre-fetch dedup sets
  const [libRes, candRes] = await Promise.all([
    db.from("places_library").select("slug").eq("user_id", userId),
    db.from("place_candidates").select("name").eq("user_id", userId),
  ]);
  const existingSlugs = new Set((libRes.data ?? []).map((r) => r.slug as string));
  const existingNames = new Set(
    (candRes.data ?? []).map((r) => makeSlug(r.name as string)),
  );

  // Batch updates into groups of 5 to limit Claude calls
  const batches = chunk(updates, 5);
  for (const batch of batches) {
    summary.updates_scanned += batch.length;
    const content = batch
      .map((u) => [u.title, u.summary, u.suggested_action].filter(Boolean).join(" | "))
      .join("\n");

    try {
      const result = await generateStructured<ExtractionResult>({
        system: SYSTEM,
        prompt: `Extract named place mentions from these Circle updates:\n${content}`,
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
        const { error } = await db.from("place_candidates").insert({
          user_id: userId,
          name: place.name.trim(),
          discovered_via: "circle:network-signal",
          status: "pending",
          quick_classification: place.type_guess,
          notes: `[circle-signal] ${place.snippet ?? ""}`.slice(0, 500),
        });
        if (!error) {
          existingNames.add(slug);
          summary.candidates_added++;
        }
      }
    } catch (err) {
      console.warn("[networkSignalAgent] batch failed", err);
    }
  }

  return summary;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
