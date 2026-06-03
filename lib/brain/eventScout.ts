import "server-only";

import { hasAnthropic } from "@/lib/ai/anthropic";
import { generateStructured } from "@/lib/ai/structured";
import { buildBrainContext } from "@/lib/brain/context";
import { hasTavily, searchWeb } from "@/lib/sources/tavily";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

// ── Types ────────────────────────────────────────────────────────────────────

export type ScoutEvent = {
  title: string;
  event_type:
    | "dj_set"
    | "live_music"
    | "chef_dinner"
    | "wine_event"
    | "art_opening"
    | "comedy"
    | "speaker"
    | "other";
  venue_name: string;
  named_entities: string[];
  starts_at: string; // ISO 8601
  ends_at: string | null;
  ticket_url: string | null;
  description: string;
  vibe_keywords: string[];
};

type ScoutEventResult = {
  events: ScoutEvent[];
};

// ── Query pool ────────────────────────────────────────────────────────────────

const EVENT_SCOUT_QUERIES: Array<{ q: string; domains: string[] }> = [
  {
    q: "{city} house music this weekend",
    domains: ["ra.co", "do312.com", "chicagoreader.com"],
  },
  {
    q: "{city} DJ residency this week",
    domains: ["ra.co", "do312.com", "dice.fm"],
  },
  {
    q: "{city} jazz live this week",
    domains: ["chicagoreader.com", "timeout.com", "do312.com"],
  },
  {
    q: "{city} wine dinner this month",
    domains: ["resy.com", "opentable.com", "chicago.eater.com"],
  },
  {
    q: "{city} chef collaboration dinner",
    domains: ["chicago.eater.com", "resy.com", "chicagomag.com"],
  },
  {
    q: "{city} art opening this weekend",
    domains: ["do312.com", "chicagoreader.com", "timeout.com"],
  },
  {
    q: "{city} listening bar event",
    domains: ["ra.co", "do312.com", "timeout.com"],
  },
  {
    q: "Resident Advisor {city} events",
    domains: ["ra.co"],
  },
  {
    q: "{city} tasting menu special event",
    domains: ["resy.com", "opentable.com", "chicago.eater.com"],
  },
];

// ── Extraction system prompt ──────────────────────────────────────────────────

const EVENT_SCOUT_SYSTEM_PROMPT = `You are Jarvis's EVENT SCOUT. You extract specific upcoming events in {city} from article or listing content.

HARD REQUIREMENTS — reject if any are missing:
- Specific datetime (within the next 14 days, or recurring this week)
- Specific venue (named, not "a warehouse" or "TBD")
- At least one named entity attached (artist, chef, host) OR a clearly-named recurring event (e.g. "Smyth's Tuesday tasting menu")

AUTO-REJECT:
- "Networking" events, "young professionals" mixers
- "Open format" DJ at a bottle service venue with no named DJ
- Anything with "VIP", "exclusive", "elite" framing without specifics
- Brand activations and corporate events
- Generic "live music nights" with no named act

Return strict JSON:
{
  "events": [
    {
      "title": "string",
      "event_type": "dj_set" | "live_music" | "chef_dinner" | "wine_event" | "art_opening" | "comedy" | "speaker" | "other",
      "venue_name": "string",
      "named_entities": ["string"],
      "starts_at": "ISO 8601 string",
      "ends_at": "ISO 8601 string or null",
      "ticket_url": "string or null",
      "description": "string",
      "vibe_keywords": ["string"]
    }
  ]
}

If no qualifying events found, return { "events": [] }. Empty is the correct answer when nothing clears the bar.`;

// ── Slug helper ───────────────────────────────────────────────────────────────

function makeEventSlug(title: string, venueName: string): string {
  return `${title}-${venueName}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function renderEventScoutQuery(query: string, city: string): string {
  return query.replace(/\{city\}/g, city).replace(/\s+/g, " ").trim();
}

function eventScoutSystemPrompt(city: string): string {
  return EVENT_SCOUT_SYSTEM_PROMPT.replace(/\{city\}/g, city);
}

// ── Dedup key ─────────────────────────────────────────────────────────────────
// Match on venue (normalised) + calendar date only. Two events at the same
// venue on the same date are almost certainly the same event, even if Claude
// extracts slightly different start times (8:00 PM vs 20:00, off-by-one minute).

function dedupeKey(venueName: string, startsAt: string): string {
  const venueNorm = venueName.toLowerCase().replace(/[^a-z0-9]/g, "");
  // Take only the date portion: "YYYY-MM-DD" (first 10 chars of any ISO string)
  const dateNorm = startsAt.slice(0, 10);
  return `${venueNorm}:${dateNorm}`;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function runEventScout(
  userId: string,
): Promise<{ candidates_added: number }> {
  const supabase = getSupabaseServiceClient();
  let candidates_added = 0;

  if (!hasTavily()) {
    console.warn("[eventScout] TAVILY_API_KEY not set — skipping Event Scout run");
    return { candidates_added };
  }

  const brainContext = await buildBrainContext({ userId, includeWeather: false, supabase });
  const city = brainContext.homeCity?.trim();
  if (!city) {
    console.warn("[eventScout] No profile home city — skipping Event Scout run");
    return { candidates_added };
  }
  const chicagoLike = /chicago/i.test(city);

  // Collect articles across all queries (parallel batches of 3)
  const articleMap = new Map<string, { title: string; content: string; url: string }>();

  const batchSize = 3;
  for (let i = 0; i < EVENT_SCOUT_QUERIES.length; i += batchSize) {
    const batch = EVENT_SCOUT_QUERIES.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(({ q, domains }) =>
        searchWeb({
          query: renderEventScoutQuery(q, city),
          maxResults: 5,
          days: 14,
          includeDomains: chicagoLike ? domains : undefined,
        }),
      ),
    );
    for (const res of results) {
      if (res.status !== "fulfilled") continue;
      for (const r of res.value.results) {
        if (!articleMap.has(r.url)) {
          articleMap.set(r.url, { title: r.title, url: r.url, content: r.content });
        }
      }
    }
  }

  const articles = Array.from(articleMap.values());
  console.warn(`[eventScout] ${articles.length} articles to process`);

  if (!hasAnthropic()) {
    console.warn("[eventScout] No Anthropic key — skipping extraction");
    return { candidates_added };
  }

  // Prefetch existing event dedup keys for this user
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

  // Fetch library slugs for venue matching
  const { data: libraryRows } = await supabase
    .from("places_library")
    .select("id,name,slug")
    .eq("user_id", userId);

  const libraryBySlug = new Map<string, string>(
    (libraryRows ?? []).map((r) => [
      (r.name as string).toLowerCase().replace(/[^a-z0-9]/g, ""),
      r.id as string,
    ]),
  );

  // Process articles in batches to avoid hammering Claude
  const now14Days = new Date();
  now14Days.setDate(now14Days.getDate() + 14);

  for (const article of articles) {
    try {
      const prompt = JSON.stringify({
        article_title: article.title,
        article_url: article.url,
        article_content: article.content.slice(0, 1500),
        current_date: new Date().toISOString(),
        window_end: now14Days.toISOString(),
        instructions: [
          `Extract upcoming ${city} events from this article.`,
          "Only include events with a specific date within the next 14 days.",
          "Return strict JSON matching the ScoutEventResult schema.",
        ],
      });

      const result = await generateStructured<ScoutEventResult>({
        system: eventScoutSystemPrompt(city),
        prompt,
        schemaName: "ScoutEventResult",
        temperature: 0.1,
        maxTokens: 2048,
      });

      const events = result?.events ?? [];

      for (const event of events) {
        if (!event.venue_name?.trim() || !event.starts_at?.trim()) continue;

        // Validate date is in the future
        const eventDate = new Date(event.starts_at);
        if (Number.isNaN(eventDate.getTime())) continue;
        if (eventDate < new Date()) continue;

        // Dedup check
        const key = dedupeKey(event.venue_name, event.starts_at);
        if (existingKeys.has(key)) continue;

        // Try to match venue to library
        const venueNorm = event.venue_name.toLowerCase().replace(/[^a-z0-9]/g, "");
        const libraryPlaceId = libraryBySlug.get(venueNorm) ?? null;

        const slug = makeEventSlug(event.title, event.venue_name);

        const { error } = await supabase.from("current_events").insert({
          user_id: userId,
          title: event.title.trim(),
          slug,
          event_type: event.event_type ?? "other",
          venue_name: event.venue_name.trim(),
          library_place_id: libraryPlaceId,
          named_entities: event.named_entities ?? [],
          starts_at: event.starts_at,
          ends_at: event.ends_at ?? null,
          ticket_url: event.ticket_url ?? null,
          price_level: null,
          vibe_keywords: event.vibe_keywords ?? [],
          description: event.description ?? null,
          sources_cited: [{ url: article.url, title: article.title }],
          discovered_via: article.url,
          status: "pending",
        });

        if (error) {
          console.warn("[eventScout] insert failed", { event: event.title, error: error.message });
        } else {
          existingKeys.add(key);
          candidates_added++;
        }
      }
    } catch (err) {
      // Best-effort — never crash the cron run
      console.warn("[eventScout] extraction failed for article", { url: article.url, err });
    }
  }

  console.warn("[eventScout] Run complete", { candidates_added });
  return { candidates_added };
}
