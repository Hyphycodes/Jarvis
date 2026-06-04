import "server-only";

import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { qualityTierFromScore } from "@/lib/library/quality";
import { upsertSourceFromLibraryEntity } from "@/lib/library/sourceGraph";
import { researchPlace } from "@/lib/brain/researcher";
import { writeVerdict } from "@/lib/brain/verdictWriter";
import type { BrainContextPacket } from "@/lib/brain/types";
import type { FounderProfileRow } from "@/lib/types/database";

const REJECTION_CONFIDENCE_THRESHOLD = 0.3;
const DEFAULT_LIMIT = 25;

// ── Minimal context builder ───────────────────────────────────────────────────
// Cron has no session, so we build a minimal BrainContextPacket from the
// founder profile row directly — no requireOwner() needed.

function buildMinimalContext(
  founder: FounderProfileRow | null,
): BrainContextPacket {
  return {
    now: new Date().toISOString(),
    founder: {
      vibeKeywords: founder?.vibe_keywords ?? [],
      avoidKeywords: founder?.avoid_keywords ?? [],
      dealbreakers: founder?.dealbreakers ?? [],
      pinnedPrinciples: founder?.pinned_principles ?? [],
    },
    memory: [],
    recentSignals: [],
    recentActions: [],
    northTags: [],
    northPillars: [],
    people: [],
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function processCandidates(
  userId: string,
  limit: number = DEFAULT_LIMIT,
): Promise<{ researched: number; rejected: number; errors: string[] }> {
  const supabase = getSupabaseServiceClient();

  let researched = 0;
  let rejected = 0;
  const errors: string[] = [];

  // Fetch the founder profile for this user (best-effort — fallback to nulls)
  const { data: founder } = await supabase
    .from("founder_profile")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  const brainContext = buildMinimalContext(founder as FounderProfileRow | null);

  // Fetch pending candidates, oldest first, hard-capped at limit
  const { data: candidates, error: fetchError } = await supabase
    .from("place_candidates")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (fetchError) {
    const msg = `Failed to fetch place_candidates: ${fetchError.message}`;
    console.error("[libraryWorker]", msg);
    return { researched, rejected, errors: [msg] };
  }

  const rows = candidates ?? [];
  console.warn(`[libraryWorker] Processing ${rows.length} candidates`);

  for (const candidate of rows) {
    const candidateName = candidate.name as string;
    const candidateId = candidate.id as string;
    const discoveredVia = candidate.discovered_via as string | null;

    try {
      // Research the place
      const dossier = await researchPlace(candidateName, {
        discoveredUrl: discoveredVia ?? undefined,
      });

      // Reject low-confidence results
      if (dossier.confidence < REJECTION_CONFIDENCE_THRESHOLD) {
        await supabase
          .from("place_candidates")
          .update({
            status: "rejected",
            notes: `Low confidence: ${dossier.confidence.toFixed(2)}. Uncertainties: ${dossier.uncertainties.slice(0, 2).join("; ")}`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", candidateId);

        rejected++;
        continue;
      }

      // Write verdict
      const verdict = await writeVerdict(dossier, brainContext);

      // Upsert to places_library
      const now = new Date().toISOString();
      const row = {
        user_id: userId,
        name: dossier.canonical_name,
        slug: dossier.slug,
        place_type: dossier.place_type ?? "restaurant",
        neighborhood: dossier.neighborhood,
        address: null as string | null,
        lat: null as number | null,
        lng: null as number | null,
        cuisine_or_focus: dossier.cuisine_or_focus,
        price_level: dossier.price_level === "unknown" ? null : dossier.price_level,
        hours_summary: dossier.hours_summary,
        vibe_keywords: dossier.vibe_keywords,
        sources_cited: dossier.sources_cited as unknown,
        verdict: verdict.verdict,
        verdict_strength: verdict.verdict_strength,
        quality_score: verdict.verdict_strength,
        quality_tier: qualityTierFromScore(verdict.verdict_strength),
        best_for: verdict.best_for,
        not_for: verdict.not_for,
        compared_to: verdict.compared_to,
        events_observed: dossier.events_observed as unknown,
        seasonal_notes: dossier.seasonal_notes,
        last_researched_at: now,
        last_refreshed_at: now,
        updated_at: now,
      };

      const { data: upserted, error: upsertError } = await supabase
        .from("places_library")
        .upsert(row, { onConflict: "user_id,slug" })
        .select("id")
        .single();

      if (upsertError) {
        throw new Error(`places_library upsert failed: ${upsertError.message}`);
      }

      // Mark candidate as researched and link to library entry
      const libraryId = (upserted as { id: string }).id;
      const sourceId = await upsertSourceFromLibraryEntity({
        userId,
        title: dossier.canonical_name,
        url: discoveredVia,
        entityType: "place",
        qualityScore: verdict.verdict_strength,
        topics: dossier.vibe_keywords,
        supabase,
      });
      if (sourceId) {
        await supabase
          .from("places_library")
          .update({ source_id: sourceId, updated_at: now })
          .eq("id", libraryId)
          .eq("user_id", userId);
      }
      await supabase
        .from("place_candidates")
        .update({
          status: "researched",
          notes: `Linked to places_library:${libraryId}`,
          updated_at: now,
        })
        .eq("id", candidateId);

      researched++;
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : `Unknown error processing "${candidateName}"`;
      console.error("[libraryWorker] candidate failed", {
        candidateId,
        candidateName,
        err,
      });
      errors.push(`${candidateName}: ${msg}`);

      // Mark as errored so it doesn't block future runs forever
      await supabase
        .from("place_candidates")
        .update({
          notes: `Worker error: ${msg.slice(0, 200)}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", candidateId)
        .eq("status", "pending");
    }
  }

  console.warn("[libraryWorker] Done", { researched, rejected, errors: errors.length });
  return { researched, rejected, errors };
}
