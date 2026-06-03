import "server-only";

import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { hasTavily, extractUrls } from "@/lib/sources/tavily";
import { hasAnthropic, getAnthropicClient, DEFAULT_MODEL } from "@/lib/ai/anthropic";
import type { TastemakerRow } from "@/lib/types/database";

const TASTEMAKERS_PER_SWEEP = 5;

type ExtractedEvent = {
  title: string | null;
  venue: string | null;
  starts_at: string | null;
  named_entities: string[];
  ticket_url: string | null;
};

// ── Extract events from URL content via Claude ────────────────────────────────

async function extractEventsFromContent(
  content: string,
  sourceName: string,
  sourceUrl: string,
): Promise<ExtractedEvent[]> {
  if (!hasAnthropic() || !content.trim()) return [];

  try {
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 512,
      system: "Extract upcoming event bookings or performances from this webpage content. Return JSON only.",
      messages: [
        {
          role: "user",
          content: `Source: ${sourceName} (${sourceUrl})

Content:
${content.slice(0, 1200)}

Extract any upcoming events, gigs, bookings, or performances mentioned. Return strict JSON:
{ "events": [{ "title": string|null, "venue": string|null, "starts_at": string|null, "named_entities": string[], "ticket_url": string|null }] }

If no events found, return { "events": [] }.`,
        },
      ],
    });

    const rawText = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const parsed = JSON.parse(rawText) as { events?: ExtractedEvent[] };
    return parsed.events ?? [];
  } catch {
    return [];
  }
}

// ── Fetch and extract from a URL ──────────────────────────────────────────────

async function fetchAndExtract(
  url: string,
  label: string,
): Promise<ExtractedEvent[]> {
  if (!hasTavily()) return [];
  try {
    const res = await extractUrls({ urls: [url] });
    const content = res.results[0]?.rawContent ?? res.results[0]?.content ?? "";
    return extractEventsFromContent(content, label, url);
  } catch (err) {
    console.warn("[tastemakerSweep] fetch failed", { url, err });
    return [];
  }
}

// ── Dedup key ─────────────────────────────────────────────────────────────────

function dedupeKey(venue: string, startsAt: string): string {
  const v = venue.toLowerCase().replace(/[^a-z0-9]/g, "");
  // Date only — same venue on the same calendar day = same event
  const d = startsAt.slice(0, 10);
  return `${v}:${d}`;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function sweepTastemakers(
  userId: string,
): Promise<{ checked: number; new_signals: number }> {
  const supabase = getSupabaseServiceClient();
  let checked = 0;
  let new_signals = 0;

  if (!hasTavily()) {
    console.warn("[tastemakerSweep] No Tavily key — skipping");
    return { checked, new_signals };
  }

  // Fetch tastemakers ordered by least recently checked
  const { data: tastemakers, error } = await supabase
    .from("tastemakers")
    .select("*")
    .eq("user_id", userId)
    .order("last_checked_at", { ascending: true, nullsFirst: true })
    .limit(TASTEMAKERS_PER_SWEEP);

  if (error) {
    console.error("[tastemakerSweep] fetch failed", error);
    return { checked, new_signals };
  }

  const rows = (tastemakers ?? []) as TastemakerRow[];

  // Prefetch existing event dedup keys to avoid duplicates
  const { data: existingEvents } = await supabase
    .from("current_events")
    .select("venue_name,starts_at")
    .eq("user_id", userId)
    .gte("starts_at", new Date().toISOString());

  const existingKeys = new Set<string>(
    (existingEvents ?? []).map((e) =>
      dedupeKey(e.venue_name as string, e.starts_at as string),
    ),
  );

  for (const tastemaker of rows) {
    const urlsToCheck: Array<{ url: string; label: string }> = [];

    if (tastemaker.ra_url) urlsToCheck.push({ url: tastemaker.ra_url, label: "Resident Advisor" });
    if (tastemaker.website_url) urlsToCheck.push({ url: tastemaker.website_url, label: tastemaker.name });
    if (tastemaker.newsletter_url) urlsToCheck.push({ url: tastemaker.newsletter_url, label: `${tastemaker.name} newsletter` });
    if (tastemaker.linktree_url) urlsToCheck.push({ url: tastemaker.linktree_url, label: `${tastemaker.name} links` });

    const allEvents: ExtractedEvent[] = [];

    for (const { url, label } of urlsToCheck.slice(0, 3)) {
      const events = await fetchAndExtract(url, label);
      allEvents.push(...events);
    }

    // Insert new event signals
    for (const ev of allEvents) {
      if (!ev.venue || !ev.starts_at || !ev.title) continue;

      // Validate date
      const eventDate = new Date(ev.starts_at);
      if (Number.isNaN(eventDate.getTime()) || eventDate < new Date()) continue;

      const key = dedupeKey(ev.venue, ev.starts_at);
      if (existingKeys.has(key)) continue;

      const { error: insertError } = await supabase.from("current_events").insert({
        user_id: userId,
        title: ev.title.trim(),
        venue_name: ev.venue.trim(),
        named_entities: [tastemaker.name, ...(ev.named_entities ?? [])],
        starts_at: ev.starts_at,
        ticket_url: ev.ticket_url ?? null,
        discovered_via: `tastemaker:${tastemaker.id}`,
        status: "pending",
        // High-trust signal because it came from a tastemaker
        verdict_strength: 0.65,
        description: `Discovered via ${tastemaker.name} (${tastemaker.role ?? "tastemaker"}).`,
        sources_cited: urlsToCheck.map((u) => ({ url: u.url, label: u.label })),
      });

      if (!insertError) {
        existingKeys.add(key);
        new_signals++;
      }
    }

    // Update last_checked_at
    await supabase
      .from("tastemakers")
      .update({ last_checked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", tastemaker.id);

    checked++;
  }

  console.warn("[tastemakerSweep] Done", { checked, new_signals });
  return { checked, new_signals };
}
