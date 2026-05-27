import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { getAnthropicClient, DEFAULT_MODEL, hasAnthropic } from "@/lib/ai/anthropic";
import { hasTavily, extractUrls } from "@/lib/sources/tavily";
import { getLibraryEntryByName, researchAndStore } from "@/lib/actions/placesLibrary";
import { writeVerdict } from "@/lib/brain/verdictWriter";
import { writeEventVerdict } from "@/lib/brain/eventVerdict";
import { buildBrainContext } from "@/lib/brain/context";
import { researchPlace } from "@/lib/brain/researcher";
import type { VerdictOutput } from "@/lib/brain/verdictWriter";
import type { EventVerdictOutput } from "@/lib/brain/eventVerdict";
import type { PlacesLibraryRow } from "@/lib/types/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// ── Types ────────────────────────────────────────────────────────────────────

type ImageExtractionResult = {
  venue: string | null;
  datetime: string | null;
  artist_or_host: string | null;
  vibe_cues: string[];
  raw_text: string;
};

type DropContext = {
  venue_name: string | null;
  event_details: { datetime: string | null; artist_or_host: string | null } | null;
  raw_text: string;
  source_url: string | null;
};

type DropResult = {
  ok: true;
  venue_name: string | null;
  is_event: boolean;
  event_details?: { datetime: string | null; artist_or_host: string | null } | null;
  libraryEntry: PlacesLibraryRow | null;
  verdict: VerdictOutput | null;
  event_verdict: EventVerdictOutput | null;
  action_recommendation: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function actionFromVerdict(verdict: VerdictOutput | null): string {
  if (!verdict) return "Keep an eye on it.";
  switch (verdict.surface_priority) {
    case "high": return "Worth acting on. Save it.";
    case "medium": return "Put it in Holding.";
    default: return "Keep an eye on it.";
  }
}

function actionFromEventVerdict(verdict: EventVerdictOutput | null): string {
  if (!verdict) return "Keep an eye on it.";
  switch (verdict.recommended_action) {
    case "surface_radar": return "Worth going. Get a ticket.";
    case "hold": return "Put it on the radar.";
    default: return "Skip this one.";
  }
}

/** Extract a venue name from raw pasted text using simple heuristics. */
function extractVenueFromText(text: string): string | null {
  if (!text) return null;

  // Look for quoted names: "Bar Name" or 'Bar Name'
  const quotedMatch = text.match(/["']([A-Z][^"']{2,40})["']/);
  if (quotedMatch) return quotedMatch[1].trim();

  // Look for "called X" or "called X in" patterns
  const calledMatch = text.match(/called\s+([A-Z][A-Za-z\s&']{2,30})(?:\s+in|\s+at|[,.]|$)/);
  if (calledMatch) return calledMatch[1].trim();

  // Look for "at X" or "@ X" with a capitalized proper noun
  const atMatch = text.match(/(?:at|@)\s+([A-Z][A-Za-z\s&']{2,30})(?:\s+in|\s+on|\s+for|[,.]|$)/);
  if (atMatch) return atMatch[1].trim();

  return null;
}

// ── Image extraction ──────────────────────────────────────────────────────────

async function extractFromImage(
  imageBase64: string,
  mediaType: string,
): Promise<ImageExtractionResult> {
  const validMediaType = (mediaType && ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(mediaType))
    ? (mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp")
    : "image/jpeg";

  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 512,
    system: "Extract concrete event/place information from this image. Return JSON only.",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: validMediaType,
              data: imageBase64,
            },
          },
          {
            type: "text",
            text: 'Extract all venue, event, and vibe information visible in this image. Return strict JSON: { "venue": string|null, "datetime": string|null, "artist_or_host": string|null, "vibe_cues": string[], "raw_text": string }',
          },
        ],
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

  try {
    return JSON.parse(rawText) as ImageExtractionResult;
  } catch {
    return { venue: null, datetime: null, artist_or_host: null, vibe_cues: [], raw_text: rawText };
  }
}

// ── URL extraction ────────────────────────────────────────────────────────────

async function extractFromUrl(url: string): Promise<{ venue_name: string | null; content: string }> {
  if (!hasTavily()) return { venue_name: null, content: "" };

  try {
    const res = await extractUrls({ urls: [url] });
    const content = res.results[0]?.rawContent ?? res.results[0]?.content ?? "";

    if (!content || !hasAnthropic()) {
      return { venue_name: null, content };
    }

    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 256,
      system: "Extract venue/place name from web page content. Return JSON only.",
      messages: [
        {
          role: "user",
          content: `Extract the venue name from this URL content. Return strict JSON: { "venue": string|null }\n\nURL: ${url}\nContent snippet: ${content.slice(0, 800)}`,
        },
      ],
    });

    const raw = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    try {
      const parsed = JSON.parse(raw) as { venue?: string | null };
      return { venue_name: parsed.venue ?? null, content };
    } catch {
      return { venue_name: null, content };
    }
  } catch (err) {
    console.warn("[drop] URL extraction failed", { url, err });
    return { venue_name: null, content: "" };
  }
}

// ── Main route ────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    await requireOwner();

    const body = (await req.json().catch(() => ({}))) as {
      text?: string;
      url?: string;
      image_base64?: string;
      image_media_type?: string;
    };

    const { text, url, image_base64, image_media_type } = body;

    // Must have at least one input
    if (!text?.trim() && !url?.trim() && !image_base64) {
      return NextResponse.json(
        { ok: false, error: "Provide text, url, or image_base64." },
        { status: 400 },
      );
    }

    // Assemble drop context
    const dropContext: DropContext = {
      venue_name: null,
      event_details: null,
      raw_text: text?.trim() ?? "",
      source_url: url?.trim() ?? null,
    };

    // 1. Image extraction
    if (image_base64 && hasAnthropic()) {
      try {
        const imageResult = await extractFromImage(
          image_base64,
          image_media_type ?? "image/jpeg",
        );
        if (imageResult.venue) dropContext.venue_name = imageResult.venue;
        if (imageResult.raw_text) dropContext.raw_text = imageResult.raw_text + (text ? `\n${text}` : "");
        if (imageResult.datetime || imageResult.artist_or_host) {
          dropContext.event_details = {
            datetime: imageResult.datetime,
            artist_or_host: imageResult.artist_or_host,
          };
        }
      } catch (err) {
        console.warn("[drop] Image extraction failed", err);
      }
    }

    // 2. URL extraction (if no venue yet)
    if (!dropContext.venue_name && url?.trim()) {
      try {
        const urlResult = await extractFromUrl(url.trim());
        if (urlResult.venue_name) dropContext.venue_name = urlResult.venue_name;
      } catch (err) {
        console.warn("[drop] URL extraction failed", err);
      }
    }

    // 3. Text parsing (if still no venue)
    if (!dropContext.venue_name && text?.trim()) {
      dropContext.venue_name = extractVenueFromText(text.trim());
    }

    // 4. Venue lookup + research
    let libraryEntry: PlacesLibraryRow | null = null;
    let dossier = null;

    if (dropContext.venue_name) {
      // Try to get existing library entry first
      try {
        libraryEntry = await getLibraryEntryByName(dropContext.venue_name);
      } catch {
        // getLibraryEntryByName uses requireOwner internally — ignore errors
      }

      // If not in library, research it now
      if (!libraryEntry) {
        try {
          const result = await researchAndStore(dropContext.venue_name, {
            discoveredUrl: dropContext.source_url ?? undefined,
            snippet: dropContext.raw_text || undefined,
          });
          libraryEntry = null; // researchAndStore doesn't return the full row
          dossier = result.dossier;

          // Fetch the newly stored entry
          try {
            libraryEntry = await getLibraryEntryByName(dropContext.venue_name);
          } catch {
            // Best-effort
          }
        } catch (err) {
          console.warn("[drop] Research failed for venue", {
            venue: dropContext.venue_name,
            err,
          });
          // Try a direct research without storing if researchAndStore fails
          try {
            dossier = await researchPlace(dropContext.venue_name, {
              discoveredUrl: dropContext.source_url ?? undefined,
              snippet: dropContext.raw_text || undefined,
            });
          } catch {
            // Best-effort
          }
        }
      }
    }

    // 5. Determine if this is event-shaped or place-shaped
    const isEvent = Boolean(
      dropContext.event_details?.datetime ||
      dropContext.event_details?.artist_or_host,
    );

    // 6. Write a verdict — event path or place path
    let verdict: VerdictOutput | null = null;
    let event_verdict: EventVerdictOutput | null = null;

    try {
      const brainContext = await buildBrainContext({ includeWeather: false });

      if (isEvent && dropContext.venue_name) {
        // Event path: use Event Verdict Writer
        const syntheticEvent = {
          id: "drop-" + Date.now(),
          user_id: "",
          title: dropContext.event_details?.artist_or_host
            ? `${dropContext.event_details.artist_or_host} at ${dropContext.venue_name}`
            : `Event at ${dropContext.venue_name}`,
          slug: null,
          event_type: "other" as const,
          venue_name: dropContext.venue_name,
          library_place_id: libraryEntry?.id ?? null,
          named_entities: dropContext.event_details?.artist_or_host
            ? [dropContext.event_details.artist_or_host]
            : [],
          starts_at: dropContext.event_details?.datetime ?? new Date().toISOString(),
          ends_at: null,
          ticket_url: dropContext.source_url,
          price_level: null,
          vibe_keywords: [],
          description: dropContext.raw_text || null,
          sources_cited: null,
          verdict: null,
          verdict_strength: null,
          discovered_at: new Date().toISOString(),
          discovered_via: dropContext.source_url,
          status: "pending",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        event_verdict = await writeEventVerdict(syntheticEvent, libraryEntry, brainContext);
      } else {
        // Place path: use Place Verdict Writer
        const effectiveDossier = dossier ?? (libraryEntry
          ? {
              canonical_name: libraryEntry.name,
              slug: libraryEntry.slug,
              place_type: libraryEntry.place_type as "restaurant",
              neighborhood: libraryEntry.neighborhood,
              cuisine_or_focus: libraryEntry.cuisine_or_focus ?? "",
              price_level: (libraryEntry.price_level ?? "unknown") as "$",
              hours_summary: libraryEntry.hours_summary ?? "",
              vibe_keywords: libraryEntry.vibe_keywords ?? [],
              sources_cited: (libraryEntry.sources_cited as Array<{ url: string; publication: string; snippet: string }>) ?? [],
              events_observed: (libraryEntry.events_observed as Array<{ type: string; day?: string; notes: string }>) ?? [],
              seasonal_notes: libraryEntry.seasonal_notes,
              confidence: libraryEntry.verdict_strength ?? 0.5,
              uncertainties: [],
            }
          : null);

        if (effectiveDossier) {
          verdict = await writeVerdict(effectiveDossier, brainContext);
        }
      }
    } catch (err) {
      console.warn("[drop] Verdict writing failed", err);
    }

    const action_recommendation = isEvent
      ? actionFromEventVerdict(event_verdict)
      : actionFromVerdict(verdict);

    const result: DropResult = {
      ok: true,
      venue_name: dropContext.venue_name,
      is_event: isEvent,
      event_details: dropContext.event_details,
      libraryEntry,
      verdict,
      event_verdict,
      action_recommendation,
    };

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Drop failed";
    const status = /login|owner|auth/i.test(message) ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
