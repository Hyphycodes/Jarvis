import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { searchWeb, hasTavily } from "@/lib/sources/tavily";
import { researchPlace } from "@/lib/brain/researcher";
import { writeVerdict } from "@/lib/brain/verdictWriter";
import { buildBrainContext } from "@/lib/brain/context";
import type { PlacesLibraryRow } from "@/lib/types/database";

const CHANGE_SIGNALS = [
  "new chef",
  "new head chef",
  "executive chef",
  "closed",
  "permanently closed",
  "new menu",
  "menu change",
  "moved",
  "new location",
  "under new ownership",
  "new owner",
  "rebranded",
  "rebrand",
  "reopened",
  "renovation",
  "closed for",
];

const CHANGE_SIGNAL_RE = new RegExp(CHANGE_SIGNALS.join("|"), "i");

export async function refreshLibraryEntry(
  entry: PlacesLibraryRow,
  supabase: SupabaseClient,
): Promise<{ updated: boolean; changes: string[] }> {
  const changes: string[] = [];

  if (!hasTavily()) {
    await touchRefreshedAt(entry.id, supabase);
    return { updated: false, changes: [] };
  }

  let freshResults: Array<{ url: string; content: string; title: string; published_date?: string }> = [];
  try {
    const res = await searchWeb({
      query: `"${entry.name}" Chicago`,
      topic: "news",
      maxResults: 5,
      days: 60,
    });
    freshResults = res.results;
  } catch {
    await touchRefreshedAt(entry.id, supabase);
    return { updated: false, changes: [] };
  }

  if (freshResults.length === 0) {
    await touchRefreshedAt(entry.id, supabase);
    return { updated: false, changes: [] };
  }

  // Check for new publications not already in sources_cited
  const existingUrls = new Set(
    Array.isArray(entry.sources_cited)
      ? (entry.sources_cited as Array<{ url?: string }>).map((s) => s.url ?? "")
      : [],
  );
  const freshUrls = freshResults.map((r) => r.url);
  const hasNewSources = freshUrls.some((url) => !existingUrls.has(url));

  // Scan fresh content for change signals
  const combinedText = freshResults.map((r) => `${r.title} ${r.content}`).join(" ");
  const hasChangeSignal = CHANGE_SIGNAL_RE.test(combinedText);

  // Extract event signals from fresh results
  const eventKeywords = /event|concert|dinner|pop.up|residency|exhibit|show|performance/i;
  const eventsFromRefresh = freshResults.filter((r) => eventKeywords.test(`${r.title} ${r.content}`));

  if (eventsFromRefresh.length > 0) {
    changes.push(`Found ${eventsFromRefresh.length} potential event signal(s) in refresh`);
  }

  if (!hasChangeSignal || !hasNewSources) {
    await touchRefreshedAt(entry.id, supabase);
    return { updated: false, changes };
  }

  // Meaningful change detected — re-research and re-verdict
  changes.push("Change signal detected — re-researching");

  try {
    const dossier = await researchPlace(entry.name);
    const brainContext = await buildBrainContext({ includeWeather: false });
    const verdict = await writeVerdict(dossier, brainContext);

    const now = new Date().toISOString();
    await supabase
      .from("places_library")
      .update({
        name: dossier.canonical_name,
        place_type: dossier.place_type ?? "restaurant",
        neighborhood: dossier.neighborhood,
        cuisine_or_focus: dossier.cuisine_or_focus,
        price_level: dossier.price_level === "unknown" ? null : dossier.price_level,
        hours_summary: dossier.hours_summary,
        vibe_keywords: dossier.vibe_keywords,
        sources_cited: dossier.sources_cited as unknown,
        verdict: verdict.verdict,
        verdict_strength: verdict.verdict_strength,
        best_for: verdict.best_for,
        not_for: verdict.not_for,
        compared_to: verdict.compared_to,
        events_observed: dossier.events_observed as unknown,
        seasonal_notes: dossier.seasonal_notes,
        last_researched_at: now,
        last_refreshed_at: now,
        updated_at: now,
      })
      .eq("id", entry.id);

    changes.push("Entry updated with fresh research and verdict");
    return { updated: true, changes };
  } catch (err) {
    console.error("[refresher] re-research failed", { name: entry.name, err });
    await touchRefreshedAt(entry.id, supabase);
    return { updated: false, changes: [...changes, "Re-research failed"] };
  }
}

export async function processRefresh(
  limit = 5,
  supabase: SupabaseClient,
): Promise<{ refreshed: number; updated: number }> {
  const { data: entries } = await supabase
    .from("places_library")
    .select("*")
    .order("last_refreshed_at", { ascending: true, nullsFirst: true })
    .limit(limit);

  if (!entries || entries.length === 0) return { refreshed: 0, updated: 0 };

  let refreshed = 0;
  let updated = 0;

  for (const row of entries as PlacesLibraryRow[]) {
    try {
      const result = await refreshLibraryEntry(row, supabase);
      refreshed++;
      if (result.updated) updated++;
    } catch (err) {
      console.error("[refresher] entry failed", { name: row.name, err });
    }
  }

  return { refreshed, updated };
}

async function touchRefreshedAt(id: string, supabase: SupabaseClient): Promise<void> {
  const now = new Date().toISOString();
  await supabase
    .from("places_library")
    .update({ last_refreshed_at: now, updated_at: now })
    .eq("id", id);
}
