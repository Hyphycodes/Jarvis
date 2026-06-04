import "server-only";

import { getSupabaseServiceClient } from "@/lib/supabase/server";

/**
 * The canonical source registry.
 * Generated once from general knowledge of authoritative sources.
 * Self-tuning takes over via sourceGraph behavior signals after seeding.
 *
 * trust_score: 0.65 = medium (generated canon, unproven by behavior)
 * Sources that earn wins climb; sources that produce junk sink.
 */
const CANONICAL_SOURCES: Array<{
  domain: string;
  name: string;
  sourceType: string;
  topics: string[];
  city?: string;
  trustScore: number;
}> = [
  // ── Editorial — Dining ──────────────────────────────────────────────────
  { domain: "chicago.eater.com", name: "Eater Chicago", sourceType: "publication", topics: ["dining", "bars", "nightlife", "chicago"], city: "Chicago", trustScore: 0.72 },
  { domain: "theinfatuation.com", name: "The Infatuation", sourceType: "publication", topics: ["dining", "bars", "chicago"], city: "Chicago", trustScore: 0.72 },
  { domain: "chicagomag.com", name: "Chicago Magazine", sourceType: "publication", topics: ["dining", "culture", "style", "chicago"], city: "Chicago", trustScore: 0.70 },
  { domain: "chicagoreader.com", name: "Chicago Reader", sourceType: "publication", topics: ["music", "culture", "dining", "chicago"], city: "Chicago", trustScore: 0.68 },
  { domain: "timeout.com", name: "Time Out Chicago", sourceType: "publication", topics: ["dining", "culture", "events", "chicago"], city: "Chicago", trustScore: 0.65 },
  // ── Editorial — Style / Craft ────────────────────────────────────────────
  { domain: "gq.com", name: "GQ", sourceType: "publication", topics: ["style", "menswear", "grooming", "culture"], trustScore: 0.68 },
  { domain: "esquire.com", name: "Esquire", sourceType: "publication", topics: ["style", "culture", "dining", "watches"], trustScore: 0.67 },
  { domain: "monocle.com", name: "Monocle", sourceType: "publication", topics: ["style", "culture", "design", "travel"], trustScore: 0.68 },
  { domain: "hodinkee.com", name: "Hodinkee", sourceType: "publication", topics: ["watches", "style", "craft"], trustScore: 0.72 },
  { domain: "cigaraficionado.com", name: "Cigar Aficionado", sourceType: "publication", topics: ["cigars", "lifestyle", "whiskey"], trustScore: 0.70 },
  { domain: "highsnobiety.com", name: "Highsnobiety", sourceType: "publication", topics: ["style", "culture", "sneakers", "menswear"], trustScore: 0.65 },
  { domain: "articlesofstyle.com", name: "Articles of Style", sourceType: "publication", topics: ["menswear", "style", "chicago"], city: "Chicago", trustScore: 0.68 },
  // ── Editorial — Golf / Sport ─────────────────────────────────────────────
  { domain: "golfdigest.com", name: "Golf Digest", sourceType: "publication", topics: ["golf", "courses", "gear"], trustScore: 0.70 },
  { domain: "golfweek.com", name: "Golf Week", sourceType: "publication", topics: ["golf", "courses"], trustScore: 0.67 },
  // ── Events Platforms ─────────────────────────────────────────────────────
  { domain: "do312.com", name: "Do312", sourceType: "calendar", topics: ["events", "music", "nightlife", "chicago"], city: "Chicago", trustScore: 0.72 },
  { domain: "ra.co", name: "Resident Advisor", sourceType: "calendar", topics: ["music", "electronic", "events"], trustScore: 0.70 },
  { domain: "ticketmaster.com", name: "Ticketmaster", sourceType: "calendar", topics: ["events", "concerts", "sports"], trustScore: 0.65 },
  // ── Sports ───────────────────────────────────────────────────────────────
  { domain: "whitesox.com", name: "Chicago White Sox", sourceType: "calendar", topics: ["sports", "baseball", "chicago", "white-sox"], city: "Chicago", trustScore: 0.72 },
  { domain: "espn.com", name: "ESPN", sourceType: "publication", topics: ["sports", "nba", "baseball", "scores"], trustScore: 0.68 },
  { domain: "nba.com", name: "NBA", sourceType: "calendar", topics: ["sports", "nba", "basketball"], trustScore: 0.70 },
  // ── Chicago-Specific ─────────────────────────────────────────────────────
  { domain: "choosechicago.com", name: "Choose Chicago", sourceType: "publication", topics: ["chicago", "culture", "tourism", "events"], city: "Chicago", trustScore: 0.65 },
  { domain: "resy.com", name: "Resy", sourceType: "calendar", topics: ["dining", "reservations", "chicago"], trustScore: 0.65 },
];

export async function seedCanonicalSources(userId: string): Promise<{
  seeded: number;
  skipped: number;
  errors: number;
}> {
  const supabase = getSupabaseServiceClient();
  let seeded = 0;
  let skipped = 0;
  let errors = 0;

  for (const source of CANONICAL_SOURCES) {
    try {
      const sourceKey = source.domain;

      // Fetch existing row to avoid downgrading earned trust
      const { data: existing } = await supabase
        .from("intelligence_sources")
        .select("id, trust_score")
        .eq("user_id", userId)
        .eq("source_key", sourceKey)
        .maybeSingle();

      const existingTrust = (existing as { trust_score?: number } | null)?.trust_score ?? 0;
      const existingId = (existing as { id?: string } | null)?.id;

      // Never downgrade a source that has earned higher trust through behavior
      const trustToSet = Math.max(existingTrust, source.trustScore);

      if (existingId) {
        // Update name, topics, type — but preserve earned trust
        const { error } = await supabase
          .from("intelligence_sources")
          .update({
            name: source.name,
            source_type: source.sourceType,
            topics: source.topics,
            city: source.city ?? null,
            trust_score: trustToSet,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingId)
          .eq("user_id", userId);
        if (error) {
          console.error("[seedSources] update failed", source.domain, error.message);
          errors++;
        } else {
          skipped++; // Already exists, just refreshed
        }
      } else {
        // New source — insert at seed trust level
        const { error } = await supabase.from("intelligence_sources").insert({
          user_id: userId,
          source_key: sourceKey,
          source_type: source.sourceType,
          domain: source.domain,
          url: `https://${source.domain}`,
          name: source.name,
          city: source.city ?? null,
          topics: source.topics,
          trust_score: source.trustScore,
          taste_fit_score: 0.60,
          novelty_score: 0.55,
          freshness_score: 0.55,
          cadence_hours: 48, // Re-check every 48h initially; behavior tunes this
          status: "watching",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        if (error) {
          console.error("[seedSources] insert failed", source.domain, error.message);
          errors++;
        } else {
          seeded++;
        }
      }
    } catch (err) {
      console.error("[seedSources] unexpected error", source.domain, err);
      errors++;
    }
  }

  console.log(`[seedSources] Done — seeded: ${seeded}, refreshed: ${skipped}, errors: ${errors}`);
  return { seeded, skipped, errors };
}
