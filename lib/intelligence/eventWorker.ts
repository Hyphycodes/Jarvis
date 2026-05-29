import "server-only";

import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { writeEventVerdict } from "@/lib/brain/eventVerdict";
import type { BrainContextPacket } from "@/lib/brain/types";
import type { CurrentEventRow, FounderProfileRow, PlacesLibraryRow } from "@/lib/types/database";

const DEFAULT_LIMIT = 20;

// ── Minimal context builder (no session required — for cron use) ───────────────

function buildMinimalContext(founder: FounderProfileRow | null): BrainContextPacket {
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
    people: [],
  };
}

// ── Why-now string for surfaced_items ─────────────────────────────────────────

function buildWhyNow(event: CurrentEventRow): string {
  const parts: string[] = [];
  if (event.named_entities.length > 0) {
    parts.push(event.named_entities.slice(0, 2).join(" + "));
  }
  if (event.starts_at) {
    const d = new Date(event.starts_at);
    if (!Number.isNaN(d.getTime())) {
      parts.push(
        `${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} at ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`,
      );
    }
  }
  return parts.join(" · ") || "Upcoming event.";
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function processEventCandidates(
  userId: string,
  limit: number = DEFAULT_LIMIT,
): Promise<{ surfaced: number; held: number; rejected: number; errors: string[] }> {
  const supabase = await getServerSupabase();

  let surfaced = 0;
  let held = 0;
  let rejected = 0;
  const errors: string[] = [];

  // Fetch founder profile for taste context
  const { data: founder } = await supabase
    .from("founder_profile")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  const context = buildMinimalContext(founder as FounderProfileRow | null);

  // Fetch pending events, soonest first, hard-capped
  const { data: candidates, error: fetchError } = await supabase
    .from("current_events")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "pending")
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(Math.min(limit, DEFAULT_LIMIT));

  if (fetchError) {
    const msg = `Failed to fetch current_events: ${fetchError.message}`;
    console.error("[eventWorker]", msg);
    return { surfaced, held, rejected, errors: [msg] };
  }

  const rows = (candidates ?? []) as CurrentEventRow[];
  console.warn(`[eventWorker] Processing ${rows.length} event candidates`);

  for (const event of rows) {
    try {
      // Fetch linked library entry if available
      let libraryEntry: PlacesLibraryRow | null = null;
      if (event.library_place_id) {
        const { data: lib } = await supabase
          .from("places_library")
          .select("*")
          .eq("id", event.library_place_id)
          .maybeSingle();
        libraryEntry = (lib as PlacesLibraryRow | null) ?? null;
      }

      const verdict = await writeEventVerdict(event, libraryEntry, context);
      const now = new Date().toISOString();

      if (verdict.recommended_action === "reject") {
        await supabase
          .from("current_events")
          .update({
            status: "rejected",
            verdict: verdict.verdict,
            verdict_strength: verdict.verdict_strength,
            updated_at: now,
          })
          .eq("id", event.id);
        rejected++;
        continue;
      }

      const newStatus = verdict.recommended_action === "surface_radar" ? "surfaced" : "verified";

      // Update the event row
      await supabase
        .from("current_events")
        .update({
          status: newStatus,
          verdict: verdict.verdict,
          verdict_strength: verdict.verdict_strength,
          updated_at: now,
        })
        .eq("id", event.id);

      // Create a surfaced_items row for Radar if verdict is strong enough
      if (verdict.recommended_action === "surface_radar") {
        const whyNow = buildWhyNow(event);
        const { error: surfaceError } = await supabase
          .from("surfaced_items")
          .insert({
            user_id: userId,
            destination: "radar",
            source: "event_pulse",
            source_id: event.id,
            title: event.title,
            subtitle: event.venue_name,
            description: verdict.verdict,
            location_name: event.venue_name,
            starts_at: event.starts_at,
            ends_at: event.ends_at ?? null,
            url: event.ticket_url ?? null,
            type: "event",
            category: "events",
            tags: event.vibe_keywords ?? [],
            reasons: [whyNow, verdict.verdict],
            score: verdict.verdict_strength,
            status: "shown",
            payload: {
              event_id: event.id,
              event_type: event.event_type,
              named_entities: event.named_entities,
              venue_name: event.venue_name,
              library_place_id: event.library_place_id,
              verdict_strength: verdict.verdict_strength,
              why_now: whyNow,
            },
          });

        if (surfaceError) {
          console.warn("[eventWorker] surfaced_items insert failed", {
            event: event.title,
            error: surfaceError.message,
          });
        }
        surfaced++;
      } else {
        held++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : `Unknown error for "${event.title}"`;
      console.error("[eventWorker] event failed", { id: event.id, title: event.title, err });
      errors.push(`${event.title}: ${msg}`);
    }
  }

  console.warn("[eventWorker] Done", { surfaced, held, rejected, errors: errors.length });
  return { surfaced, held, rejected, errors };
}
