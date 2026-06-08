import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { hasAnthropic } from "@/lib/ai/anthropic";
import { generateStructured } from "@/lib/ai/structured";
import { hasTavily, searchWeb } from "@/lib/sources/tavily";
import { buildBrainContext } from "@/lib/brain/context";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { normalizeExternalId } from "@/lib/radar/engine/curation";
import {
  CULTURE_SUBLIBRARIES,
  CULTURE_SCOUT_SUBLIBRARIES,
  classifyCultureSubLibrary,
  type CultureSubLibrary,
} from "@/lib/radar/engine/culture/config";

/**
 * Culture scout — Tavily institution search + Claude extraction per sub-library.
 * Culture is mostly TIMELESS (current exhibits/series/screenings), so unlike the
 * event scout it doesn't lean on dated-event APIs; it reads institution programming
 * and extracts the cultural item + reason. Writes culture_items (status='discovered').
 */

export type CultureScoutResult = {
  subLibrary: CultureSubLibrary;
  proposed: number;
  added: number;
  skippedExisting: number;
  errors: string[];
};

type Extracted = {
  title: string;
  institution_name?: string;
  venue_name?: string;
  neighborhood?: string;
  is_dated?: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
  cultural_reason?: string;
  image_url?: string | null;
};

export async function scoutCulture(input: {
  userId: string;
  supabase?: SupabaseClient;
}): Promise<CultureScoutResult[]> {
  const supabase = input.supabase ?? getSupabaseServiceClient();
  const out: CultureScoutResult[] = [];
  if (!hasTavily() || !hasAnthropic()) return out;

  const brain = await buildBrainContext({ userId: input.userId, includeWeather: false, supabase });
  const city = brain.homeCity?.trim() || "Chicago";

  // Existing dedup keys.
  const { data: existingRows } = await supabase
    .from("culture_items")
    .select("external_id")
    .eq("user_id", input.userId)
    .limit(2000);
  const existing = new Set<string>(
    ((existingRows ?? []) as Array<{ external_id: string | null }>).map((r) => r.external_id).filter((v): v is string => Boolean(v)),
  );

  for (const subLibrary of CULTURE_SCOUT_SUBLIBRARIES) {
    const cfg = CULTURE_SUBLIBRARIES[subLibrary];
    const result: CultureScoutResult = { subLibrary, proposed: 0, added: 0, skippedExisting: 0, errors: [] };

    // Gather articles from the specialist sources.
    const articles = new Map<string, { title: string; url: string; content: string }>();
    for (const template of cfg.queries) {
      try {
        const res = await searchWeb({ query: template.replace("{city}", city), maxResults: 5 });
        for (const r of res.results) {
          if (!articles.has(r.url)) articles.set(r.url, { title: r.title, url: r.url, content: r.content.slice(0, 1500) });
        }
      } catch {
        // best-effort
      }
    }
    if (articles.size === 0) {
      out.push(result);
      continue;
    }

    let extracted: Extracted[] = [];
    try {
      extracted = await extract(cfg.label, cfg.brief, city, Array.from(articles.values()));
    } catch (err) {
      result.errors.push(`extract: ${err instanceof Error ? err.message : String(err)}`);
      out.push(result);
      continue;
    }
    result.proposed = extracted.length;

    const rows: Array<Record<string, unknown>> = [];
    const batchSeen = new Set<string>();
    for (const e of extracted) {
      const title = e.title?.trim();
      const institution = e.institution_name?.trim() || e.venue_name?.trim() || null;
      if (!title || !institution) continue;
      const externalId = normalizeExternalId(`${title}-${institution}`);
      if (existing.has(externalId) || batchSeen.has(externalId)) {
        result.skippedExisting += 1;
        continue;
      }
      batchSeen.add(externalId);
      const sub = classifyCultureSubLibrary({
        title,
        description: e.cultural_reason ?? null,
        venue_name: e.venue_name ?? null,
        institution_name: e.institution_name ?? null,
      });
      const isDated = Boolean(e.is_dated && e.starts_at);
      rows.push({
        user_id: input.userId,
        external_id: externalId,
        source: "culture_scout",
        source_url: null,
        discovered_via: pickSourceUrl(e, Array.from(articles.values())),
        title,
        description: e.cultural_reason ?? null,
        venue_name: e.venue_name ?? institution,
        institution_name: e.institution_name ?? institution,
        neighborhood: e.neighborhood ?? null,
        sub_library: sub,
        is_dated: isDated,
        starts_at: isDated ? e.starts_at : null,
        ends_at: isDated ? e.ends_at ?? null : null,
        image_url: isHttpUrl(e.image_url) ? e.image_url : null,
        vibe_keywords: [cfg.label.toLowerCase()],
        status: "discovered",
      });
    }

    if (rows.length > 0) {
      const { error } = await supabase.from("culture_items").insert(rows);
      if (error) result.errors.push(`insert: ${error.message}`);
      else {
        result.added = rows.length;
        for (const r of rows) existing.add(String(r.external_id));
      }
    }
    out.push(result);
  }
  return out;
}

async function extract(
  label: string,
  brief: string,
  city: string,
  articles: Array<{ title: string; url: string; content: string }>,
): Promise<Extracted[]> {
  const system = [
    `You extract REAL, current ${label} cultural items in ${city} from institution/listing content.`,
    brief,
    "Only include culturally substantive items with a named institution/venue. Skip tourist bait, immersive selfie rooms, and venue-only entries with no cultural reason.",
    "Most culture is TIMELESS (ongoing exhibits/series). Set is_dated=true ONLY for a specific one-time dated happening, and include starts_at (ISO). Otherwise is_dated=false.",
    "Return strict JSON: { \"items\": [{ \"title\": string, \"institution_name\": string, \"venue_name\": string, \"neighborhood\": string, \"is_dated\": boolean, \"starts_at\": string|null, \"ends_at\": string|null, \"cultural_reason\": string, \"image_url\": string|null }] }",
    "cultural_reason: one line on WHY it matters (curatorial premise / significance). No hallucinated facts.",
  ].join("\n");
  const prompt = JSON.stringify({
    city,
    articles: articles.map((a) => ({ title: a.title, url: a.url, content: a.content })),
  });
  const raw = await generateStructured<{ items?: Extracted[] }>({
    system,
    prompt,
    schemaName: `culture_extract_${label.toLowerCase().replace(/[^a-z]+/g, "_")}`,
    temperature: 0.2,
    maxTokens: 3000,
  });
  return Array.isArray(raw?.items) ? raw.items.filter((i) => i && typeof i.title === "string") : [];
}

function pickSourceUrl(e: Extracted, articles: Array<{ title: string; url: string }>): string | null {
  // Best-effort: first article url (the extraction came from these sources).
  return articles[0]?.url ?? null;
}

function isHttpUrl(v: unknown): v is string {
  return typeof v === "string" && /^https?:\/\//i.test(v);
}
