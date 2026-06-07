import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { hasAnthropic } from "@/lib/ai/anthropic";
import { generateStructured } from "@/lib/ai/structured";
import { researchPlace } from "@/lib/brain/researcher";
import { writeVerdict } from "@/lib/brain/verdictWriter";
import type { BrainContextPacket } from "@/lib/brain/types";
import { qualityTierFromScore } from "@/lib/library/quality";
import { upsertSourceFromLibraryEntity } from "@/lib/library/sourceGraph";
import { assessResultQuality } from "@/lib/sources/resultQuality";
import { hasTavily, searchWeb } from "@/lib/sources/tavily";
import {
  normalizeRadarClassification,
  type RadarCategory,
  typeForRadarCategory,
} from "@/lib/radar/category";
import {
  selectFairly,
  rowCategory,
  rowSource,
  tags,
  readRaw,
  stringValue,
  arrayValue,
  type QueueEntry,
} from "@/lib/radar/candidateSelection";
import { enrichPlace } from "@/lib/library/enrichPlace";
import { enqueueFindResearch } from "@/lib/finds/researchJobs";
import { RADAR_UNDERFILLED_PROMOTION_FLOOR } from "@/lib/brain/constants";
import type { RunBudget } from "@/lib/radar/foundationSprint";
import type { FounderProfileRow, Json, RadarCandidateInboxRow } from "@/lib/types/database";

export type CandidateConversionResult = {
  reviewed: number;
  placesCreated: number;
  placesUpdated: number;
  eventsCreated: number;
  eventsUpdated: number;
  styleSurfaced: number;
  sourcesCreated: number;
  rejected: number;
  duplicates: number;
  needsEnrichment: number;
  errors: string[];
  timeBudgetReached: boolean;
};

// Categories that live in places_library and surface through the materializer.
// NOTE: "moves" is intentionally NOT here — moves route through researchAndRouteMove,
// which splits free/self-directed flows (surfaced directly) from paid/bookable
// venue activities (place research).
const PLACE_LIKE: ReadonlySet<RadarCategory> = new Set<RadarCategory>([
  "dining",
  "places",
  "culture",
]);
// Below this dossier confidence we don't even store a Library row — same bar the
// proven place pipeline (libraryWorker.processCandidates) uses.
const REJECT_CONFIDENCE = 0.3;
// Real research costs Google/Tavily/Claude calls, so cap how many candidates we
// research per run. Cron repeats; per-category fairness drains every lane.
const DEFAULT_RESEARCH_BUDGET = 12;

export async function convertCandidateInboxToLibrary(input: {
  userId: string;
  supabase: SupabaseClient;
  limit?: number;
  /** Override how many candidates to research this run (default caps at 12). */
  researchBudget?: number;
  budget?: RunBudget;
}): Promise<CandidateConversionResult> {
  const result: CandidateConversionResult = {
    reviewed: 0,
    placesCreated: 0,
    placesUpdated: 0,
    eventsCreated: 0,
    eventsUpdated: 0,
    styleSurfaced: 0,
    sourcesCreated: 0,
    rejected: 0,
    duplicates: 0,
    needsEnrichment: 0,
    errors: [],
    timeBudgetReached: false,
  };
  const researchBudget = input.researchBudget ?? Math.min(input.limit ?? 30, DEFAULT_RESEARCH_BUDGET);

  const { data: founderRow } = await input.supabase
    .from("founder_profile")
    .select("avoid_keywords,dealbreakers,vibe_keywords,pinned_principles")
    .eq("user_id", input.userId)
    .maybeSingle();
  const founder = founderRow as Partial<FounderProfileRow> | null;
  const avoid = [
    ...arrayValue(founder?.avoid_keywords),
    ...arrayValue(founder?.dealbreakers),
  ];
  const context = buildMinimalContext(founder);

  // Pull a wide pool so we can fairly distribute the research budget across every
  // category instead of letting whichever lane scored highest consume the run.
  const { data, error } = await input.supabase
    .from("radar_candidate_inbox")
    .select("*")
    .eq("user_id", input.userId)
    .in("status", ["new", "evaluated"])
    .order("score", { ascending: false, nullsFirst: false })
    .order("discovered_at", { ascending: true })
    .limit(120);
  if (error) {
    result.errors.push(`candidate inbox read failed: ${error.message}`);
    return result;
  }

  const rows = (data ?? []) as RadarCandidateInboxRow[];
  const queue = selectFairly(rows, researchBudget);

  for (const entry of queue) {
    if (input.budget?.shouldStopSoon()) {
      result.timeBudgetReached = true;
      result.errors.push("Time budget reached during Candidate Inbox conversion. Partial progress saved.");
      break;
    }
    await processEntry(input.supabase, input.userId, entry, context, avoid, result);
  }
  return result;
}

/**
 * Research + route a single inbox candidate immediately. Shared with the
 * chat/voice user-intent path (lib/radar/userIntent.ts) so an explicit "I want
 * to try X" runs through the exact same researcher → verdict → surface pipeline
 * as the category agents — just prioritized.
 */
export async function convertSingleCandidate(input: {
  userId: string;
  candidateId: string;
  supabase: SupabaseClient;
}): Promise<CandidateConversionResult> {
  const result: CandidateConversionResult = {
    reviewed: 0,
    placesCreated: 0,
    placesUpdated: 0,
    eventsCreated: 0,
    eventsUpdated: 0,
    styleSurfaced: 0,
    sourcesCreated: 0,
    rejected: 0,
    duplicates: 0,
    needsEnrichment: 0,
    errors: [],
    timeBudgetReached: false,
  };
  const { data: founderRow } = await input.supabase
    .from("founder_profile")
    .select("avoid_keywords,dealbreakers,vibe_keywords,pinned_principles")
    .eq("user_id", input.userId)
    .maybeSingle();
  const founder = founderRow as Partial<FounderProfileRow> | null;
  const avoid = [...arrayValue(founder?.avoid_keywords), ...arrayValue(founder?.dealbreakers)];
  const context = buildMinimalContext(founder);

  const { data: rowData, error } = await input.supabase
    .from("radar_candidate_inbox")
    .select("*")
    .eq("id", input.candidateId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (error || !rowData) {
    result.errors.push(`candidate ${input.candidateId} not found: ${error?.message ?? "missing"}`);
    return result;
  }
  const row = rowData as RadarCandidateInboxRow;
  const entry: QueueEntry = {
    row,
    category: rowCategory(row),
    userIntent: rowSource(row) === "user_intent",
  };
  await processEntry(input.supabase, input.userId, entry, context, avoid, result);
  return result;
}

async function processEntry(
  supabase: SupabaseClient,
  userId: string,
  entry: QueueEntry,
  context: BrainContextPacket,
  avoid: string[],
  result: CandidateConversionResult,
): Promise<void> {
  const { row, category, userIntent } = entry;
  const routedCategory = classifyCandidateForRadar(row, category).category;
  result.reviewed++;
  try {
    // ── Cheap negative + junk filters before spending any research $ ──────────
    const penalty = negativeFilter(row, avoid);
    if (penalty) {
      await markCandidate(supabase, userId, row.id, {
        status: "rejected",
        rejection_reason: penalty,
        reason: { summary: penalty, source: "candidate_conversion" },
      });
      result.rejected++;
      return;
    }
    const quality = assessResultQuality({
      title: row.title,
      snippet: row.description,
      url: row.url,
      category: row.entity_type,
      type: row.entity_type,
    });
    if (quality.hardReject) {
      const reason = `Rejected by discovery quality filter: ${quality.reasons.join(" ") || quality.flags.join(", ")}.`;
      await markCandidate(supabase, userId, row.id, {
        status: "rejected",
        rejection_reason: reason,
        reason: { summary: reason, quality_flags: quality.flags, source: "candidate_conversion_quality_filter" },
      });
      result.rejected++;
      return;
    }

    // ── Route by category into the real research/verdict pipelines ────────────
    if (routedCategory === "moves") {
      await researchAndRouteMove(supabase, userId, row, context, result, userIntent);
      return;
    }
    if (routedCategory && PLACE_LIKE.has(routedCategory)) {
      await researchAndStorePlace(supabase, userId, row, routedCategory, context, result, userIntent);
      return;
    }
    if (routedCategory === "events") {
      await tryQueueEvent(supabase, userId, row, result, userIntent);
      return;
    }
    if (routedCategory === "finds") {
      await researchAndSurfaceStyle(supabase, userId, row, context, result, userIntent);
      return;
    }
    if (classifyCandidate(row) === "source") {
      const sourceId = await upsertSourceFromLibraryEntity({
        userId,
        title: row.title,
        url: row.url,
        entityType: "source",
        qualityScore: normalizedScore(row),
        topics: tags(row),
        supabase,
      });
      await markCandidate(supabase, userId, row.id, {
        status: sourceId ? "library" : "evaluated",
        reason: {
          summary: sourceId ? "Converted into Source Graph." : "Source candidate needs enrichment.",
          source_id: sourceId,
        },
      });
      if (sourceId) result.sourcesCreated++;
      else result.needsEnrichment++;
      return;
    }

    // Uncategorizable — keep it for context, don't surface a stub.
    await markCandidate(supabase, userId, row.id, {
      status: "evaluated",
      reason: { summary: "Candidate reviewed; no confident category, kept for context." },
    });
    result.needsEnrichment++;
  } catch (err) {
    result.errors.push(`${row.title}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── Place-like research → real, non-stub places_library row ─────────────────────
async function researchAndStorePlace(
  supabase: SupabaseClient,
  userId: string,
  row: RadarCandidateInboxRow,
  category: RadarCategory,
  context: BrainContextPacket,
  result: CandidateConversionResult,
  userIntent: boolean,
): Promise<void> {
  const dossier = await researchPlace(row.title, {
    discoveredUrl: row.url ?? undefined,
    snippet: typeof row.description === "string" ? row.description : undefined,
    category,
  });
  if (dossier.confidence < REJECT_CONFIDENCE) {
    await markCandidate(supabase, userId, row.id, {
      status: "rejected",
      rejection_reason: `Low research confidence (${dossier.confidence.toFixed(2)}).`,
      reason: { summary: "Researcher could not build a confident dossier.", category, source: "candidate_research" },
    });
    result.rejected++;
    return;
  }

  const verdict = await writeVerdict(dossier, context);
  const score = clamp01(verdict.verdict_strength);
  const placeSlug = dossier.slug || slug(row.title);
  const now = new Date().toISOString();
  const normalized = normalizeRadarClassification({
    category,
    type: "place",
    title: dossier.canonical_name,
    description: dossier.cuisine_or_focus,
    placeType: dossier.place_type,
    tags: dossier.vibe_keywords,
    sourcePayload: {
      place_type: dossier.place_type,
      cuisine_or_focus: dossier.cuisine_or_focus,
      vibe_keywords: dossier.vibe_keywords,
    },
  });
  const libraryCategory = normalized.category ?? category;

  const { data: existing } = await supabase
    .from("places_library")
    .select("id")
    .eq("user_id", userId)
    .eq("slug", placeSlug)
    .maybeSingle();

  const sourceId = await upsertSourceFromLibraryEntity({
    userId,
    title: dossier.canonical_name,
    url: row.url,
    entityType: "place",
    qualityScore: score,
    topics: dossier.vibe_keywords,
    supabase,
  });

  const { data: upserted, error } = await supabase
    .from("places_library")
    .upsert({
      user_id: userId,
      name: dossier.canonical_name,
      slug: placeSlug,
      place_type: dossier.place_type,
      neighborhood: dossier.neighborhood ?? readNeighborhood(row),
      cuisine_or_focus: dossier.cuisine_or_focus,
      price_level: dossier.price_level === "unknown" ? null : dossier.price_level,
      hours_summary: dossier.hours_summary === "unknown" ? null : dossier.hours_summary,
      vibe_keywords: dossier.vibe_keywords,
      sources_cited: dossier.sources_cited as unknown as Json,
      // Real verdict — NOT the old "Converted from Candidate Inbox" stub marker,
      // so the materializer's stub guard no longer excludes it.
      verdict: verdict.verdict,
      verdict_strength: score,
      quality_score: score,
      quality_tier: qualityTierFromScore(score),
      best_for: verdict.best_for,
      not_for: verdict.not_for,
      compared_to: verdict.compared_to,
      events_observed: dossier.events_observed as unknown as Json,
      seasonal_notes: dossier.seasonal_notes,
      image_url: httpOrNull(row.image_url),
      source_id: sourceId,
      // enrichment_status intentionally left unset → enrichPending fills
      // address/lat/lng/hours/photo and flips it to "enriched" so the
      // materializer can surface it.
      last_researched_at: now,
      last_refreshed_at: now,
      next_refresh_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: now,
    }, { onConflict: "user_id,slug" })
    .select("id")
    .single();
  if (error) throw new Error(`places_library upsert failed: ${error.message}`);

  const libraryId = (upserted as { id?: string } | null)?.id ?? null;
  await markCandidate(supabase, userId, row.id, {
    status: "library",
    reason: {
      summary: `Researched into ${category} Library with a real verdict (${score.toFixed(2)}). Awaiting enrichment + materialization.`,
      library_id: libraryId,
      category: libraryCategory,
      quality_score: score,
      surface_priority: verdict.surface_priority,
      user_intent: userIntent,
      source: "candidate_research",
    },
  });
  if ((existing as { id?: string } | null)?.id) result.placesUpdated++;
  else result.placesCreated++;
  if (sourceId) result.sourcesCreated++;

  // Owner explicitly asked for this → surface it now as a shown Radar card
  // instead of leaving it in the discovered → promotion queue, but only once it
  // carries a real verdict above the surfacing floor (never an unresearched stub).
  if (userIntent && libraryId && score >= RADAR_UNDERFILLED_PROMOTION_FLOOR) {
    await surfaceUserIntentPlace(supabase, userId, libraryId, libraryCategory, score);
  }
}

/** Enrich + surface a researched Library place as a shown Radar card for an
 *  owner-requested (user_intent) item. */
async function surfaceUserIntentPlace(
  supabase: SupabaseClient,
  userId: string,
  libraryId: string,
  category: RadarCategory,
  score: number,
): Promise<void> {
  try {
    await enrichPlace(libraryId);
  } catch {
    // best-effort — surface with whatever location data we have
  }
  const { data: lib } = await supabase
    .from("places_library")
    .select("name, neighborhood, address, lat, lng, verdict, quality_score, image_url, best_for, vibe_keywords, price_level, cuisine_or_focus")
    .eq("id", libraryId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!lib) return;
  const place = lib as Record<string, unknown>;
  const classification = normalizeRadarClassification({
    category,
    type: "place",
    title: stringValue(place.name),
    subtitle: stringValue(place.neighborhood),
    description:
      stringValue(place.cuisine_or_focus) ??
      stringValue(place.verdict),
    placeType: stringValue(place.cuisine_or_focus),
    tags: arrayValue(place.vibe_keywords),
    sourcePayload: place,
  });
  const surfacedCategory = classification.category ?? category;
  const surfacedType = classification.type ?? typeForRadarCategory(surfacedCategory);
  const now = new Date().toISOString();
  const { data: existing } = await supabase
    .from("surfaced_items")
    .select("id")
    .eq("user_id", userId)
    .eq("source_id", libraryId)
    .not("status", "in", "(archived,passed)")
    .limit(1);
  const existingId = ((existing ?? []) as Array<{ id: string }>)[0]?.id;
  const surfaceScore = typeof place.quality_score === "number" ? place.quality_score : score;
  if (existingId) {
    await supabase
      .from("surfaced_items")
      .update({
        destination: "radar",
        status: "shown",
        type: surfacedType,
        category: surfacedCategory,
        score: surfaceScore,
        planning_state: "saved_to_radar",
        updated_at: now,
      })
      .eq("id", existingId)
      .eq("user_id", userId);
    return;
  }
  await supabase.from("surfaced_items").insert({
    user_id: userId,
    destination: "radar",
    status: "shown",
    source: "user_intent",
    source_id: libraryId,
    type: surfacedType,
    category: surfacedCategory,
    title: stringValue(place.name) ?? "Saved place",
    subtitle: stringValue(place.neighborhood),
    description: stringValue(place.verdict),
    location_name: stringValue(place.name),
    address: stringValue(place.address),
    lat: typeof place.lat === "number" ? place.lat : null,
    lng: typeof place.lng === "number" ? place.lng : null,
    url: null,
    image_url: httpOrNull(place.image_url),
    score: surfaceScore,
    planning_state: "saved_to_radar",
    reasons: arrayValue(place.best_for).slice(0, 3),
    tags: arrayValue(place.vibe_keywords),
    payload: {
      source_layer: "places_library",
      library_place_id: libraryId,
      cuisine_or_focus: stringValue(place.cuisine_or_focus),
      price_level: stringValue(place.price_level),
      user_intent: true,
    } as unknown as Json,
  });
}

// ── Moves → free flow (surfaced directly) or bookable venue (place research) ────
async function researchAndRouteMove(
  supabase: SupabaseClient,
  userId: string,
  row: RadarCandidateInboxRow,
  context: BrainContextPacket,
  result: CandidateConversionResult,
  userIntent: boolean,
): Promise<void> {
  const corrected = classifyCandidateForRadar(row, "moves");
  if (corrected.category && corrected.category !== "moves") {
    if (PLACE_LIKE.has(corrected.category)) {
      await researchAndStorePlace(supabase, userId, row, corrected.category, context, result, userIntent);
      return;
    }
    if (corrected.category === "events") {
      await tryQueueEvent(supabase, userId, row, result, userIntent);
      return;
    }
    if (corrected.category === "finds") {
      await researchAndSurfaceStyle(supabase, userId, row, context, result, userIntent);
      return;
    }
  }
  const moveKindRaw = stringValue(readRaw(row, ["move_kind"]));
  const sequence = stringValue(readRaw(row, ["sequence"]));
  const bestTime = stringValue(readRaw(row, ["best_time"]));
  const priceHint = stringValue(readRaw(row, ["price_hint"]));
  const gear = arrayValue(readRaw(row, ["gear_needed"]));
  // Free when explicitly free, or when there's a self-directed sequence and no
  // bookable/venue signal. Bookable when explicit, or venue/price-driven.
  const isFree = moveKindRaw === "free" || (moveKindRaw !== "bookable" && Boolean(sequence) && !row.url);

  // Either path can imply gear → quietly seed Finds (deduped).
  if (gear.length > 0) await linkMoveGearToFinds(supabase, userId, gear, row.title);

  if (!isFree) {
    // Paid/bookable venue activity — research the venue (hours, price, booking).
    await researchAndStorePlace(supabase, userId, row, "moves", context, result, userIntent);
    return;
  }

  // Free/self-directed move must carry a concrete sequence to be non-stub.
  if (!sequence) {
    await markCandidate(supabase, userId, row.id, {
      status: "evaluated",
      reason: { summary: "Free move needs a concrete sequence before surfacing.", category: "moves", source: "candidate_research" },
    });
    result.needsEnrichment++;
    return;
  }

  // Dedup against an existing move with the same title.
  const { data: existing } = await supabase
    .from("surfaced_items")
    .select("id")
    .eq("user_id", userId)
    .eq("category", "moves")
    .ilike("title", row.title)
    .not("status", "in", "(archived,passed)")
    .limit(1);
  if (((existing ?? []) as Array<{ id: string }>)[0]?.id) {
    await markCandidate(supabase, userId, row.id, { status: "duplicate", rejection_reason: "Move already surfaced." });
    result.duplicates++;
    return;
  }

  const description = stringValue(readRaw(row, ["relevance_brief"])) ?? row.description ?? row.title;
  const score = userIntent ? 0.82 : 0.62;
  const { error } = await supabase.from("surfaced_items").insert({
    user_id: userId,
    destination: "radar",
    status: userIntent ? "shown" : "discovered",
    source: userIntent ? "user_intent" : "category_agent",
    source_id: row.id,
    type: "move",
    category: "moves",
    title: row.title,
    subtitle: bestTime ?? null,
    description,
    url: row.url ?? null,
    image_url: httpOrNull(row.image_url),
    score,
    planning_state: userIntent ? "saved_to_radar" : "observed",
    reasons: [description].filter(Boolean),
    tags: tags(row),
    payload: {
      source_layer: "move_discovery",
      move_kind: "free",
      sequence,
      best_time: bestTime,
      price_hint: priceHint,
      gear_needed: gear,
      user_intent: userIntent,
    } as unknown as Json,
  });
  if (error) throw new Error(`move surfaced_items insert failed: ${error.message}`);

  await markCandidate(supabase, userId, row.id, {
    status: "library",
    reason: { summary: `Surfaced free move with sequence.`, category: "moves", user_intent: userIntent, source: "candidate_research" },
  });
  result.placesCreated++;
}

/** A move's implied gear becomes quiet, deduped Finds candidates (≤2 per move). */
async function linkMoveGearToFinds(
  supabase: SupabaseClient,
  userId: string,
  gear: string[],
  moveTitle: string,
): Promise<void> {
  for (const raw of gear.slice(0, 2)) {
    const mission = raw.trim();
    if (!mission) continue;
    try {
      const { data: existingFind } = await supabase
        .from("surfaced_items")
        .select("id")
        .eq("user_id", userId)
        .eq("category", "finds")
        .ilike("title", mission)
        .limit(1);
      if (((existingFind ?? []) as Array<{ id: string }>).length > 0) continue;
      const { data: existingJob } = await supabase
        .from("finds_research_jobs")
        .select("id")
        .eq("user_id", userId)
        .ilike("mission", mission)
        .in("status", ["queued", "processing"])
        .limit(1);
      if (((existingJob ?? []) as Array<{ id: string }>).length > 0) continue;
      await enqueueFindResearch({ userId, mission, context: `Gear for: ${moveTitle}`, source: "need_scout" });
    } catch {
      // best-effort — gear linkage never blocks move surfacing
    }
  }
}

// ── Events → current_events(pending), only with a real future date ──────────────
async function tryQueueEvent(
  supabase: SupabaseClient,
  userId: string,
  row: RadarCandidateInboxRow,
  result: CandidateConversionResult,
  userIntent = false,
): Promise<void> {
  const resolved = readStartsAt(row)
    ? { startsAt: readStartsAt(row) as string, venue: readVenue(row) }
    : await resolveEventDate(row);
  if (!resolved) {
    // No confident date — hold it. We never fabricate event times.
    await markCandidate(supabase, userId, row.id, {
      status: "evaluated",
      reason: {
        summary: "Event candidate held: no confident date found, so no fake event date was created.",
        needs_enrichment: true,
        category: "events",
        source: "candidate_research",
      },
    });
    result.needsEnrichment++;
    return;
  }

  const venue = resolved.venue ?? (typeof row.description === "string" ? row.description.slice(0, 80) : null) ?? "Needs venue enrichment";
  const { data: existing } = await supabase
    .from("current_events")
    .select("id")
    .eq("user_id", userId)
    .eq("title", row.title)
    .eq("starts_at", resolved.startsAt)
    .maybeSingle();
  if ((existing as { id?: string } | null)?.id) {
    await markCandidate(supabase, userId, row.id, {
      status: "duplicate",
      rejection_reason: "Duplicate event already in Event Pulse.",
    });
    result.duplicates++;
    return;
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("current_events")
    .insert({
      user_id: userId,
      title: row.title,
      slug: slug(row.title),
      event_type: "other",
      venue_name: venue,
      named_entities: [],
      starts_at: resolved.startsAt,
      ends_at: null,
      ticket_url: row.url,
      vibe_keywords: tags(row),
      description: typeof row.description === "string" ? row.description : null,
      sources_cited: [{ source: "candidate_conversion", candidate_id: row.id, converted_at: now }] as unknown as Json,
      status: "pending",
      discovered_via: row.url ?? "candidate_inbox",
      updated_at: now,
    });
  if (error) throw new Error(`current_events insert failed: ${error.message}`);

  await markCandidate(supabase, userId, row.id, {
    status: "library",
    reason: {
      summary: "Queued into Event Pulse with a real date. Awaiting event verdict + surfacing.",
      starts_at: resolved.startsAt,
      category: "events",
      source: "candidate_research",
    },
  });
  result.eventsCreated++;

  // Owner explicitly asked → surface the dated event now as a shown Radar card.
  if (userIntent) {
    const { data: existingCard } = await supabase
      .from("surfaced_items")
      .select("id")
      .eq("user_id", userId)
      .eq("category", "events")
      .ilike("title", row.title)
      .not("status", "in", "(archived,passed)")
      .limit(1);
    if (!((existingCard ?? []) as Array<{ id: string }>)[0]?.id) {
      await supabase.from("surfaced_items").insert({
        user_id: userId,
        destination: "radar",
        status: "shown",
        source: "user_intent",
        source_id: row.id,
        type: "event",
        category: "events",
        title: row.title,
        subtitle: venue,
        description: typeof row.description === "string" ? row.description : null,
        location_name: venue,
        starts_at: resolved.startsAt,
        url: row.url,
        score: 0.9,
        planning_state: "saved_to_radar",
        tags: tags(row),
        payload: { source_layer: "current_events", venue_name: venue, user_intent: true } as unknown as Json,
      });
    }
  }
}

type ResolvedEventDate = { startsAt: string; venue: string | null };

async function resolveEventDate(row: RadarCandidateInboxRow): Promise<ResolvedEventDate | null> {
  if (!hasAnthropic() || !hasTavily()) return null;
  const where = readNeighborhood(row) ?? "";
  const searchQuery = stringValue(readRaw(row, ["search_query"])) ?? "";
  try {
    const res = await searchWeb({
      query: `${row.title} ${where} ${searchQuery} date time tickets`.trim(),
      maxResults: 5,
    });
    const sources = res.results.map((r) => ({ url: r.url, title: r.title, snippet: r.content.slice(0, 400) }));
    if (sources.length === 0 && !res.answer) return null;
    const out = await generateStructured<{ starts_at: string | null; venue: string | null; confidence: number }>({
      system:
        "You extract the single NEXT upcoming start date+time for an event from web sources. " +
        "Return strict JSON. starts_at must be ISO-8601 with timezone if and only if you are confident it is the real, official upcoming date; otherwise null. " +
        "Never guess a date. confidence is 0..1.",
      prompt: JSON.stringify({ event: row.title, answer: res.answer ?? null, sources }, null, 2),
      schemaName: "EventDateExtraction",
      temperature: 0,
      maxTokens: 500,
    });
    if (!out.starts_at || out.confidence < 0.6) return null;
    const date = new Date(out.starts_at);
    if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) return null;
    return { startsAt: date.toISOString(), venue: stringValue(out.venue) };
  } catch {
    return null;
  }
}

// ── Style → researched, verdicted surfaced_items card (no place table) ──────────
type StyleVerdict = { verdict: string; strength: number; why: string; where_to_buy: string | null; price: string | null };

async function researchAndSurfaceStyle(
  supabase: SupabaseClient,
  userId: string,
  row: RadarCandidateInboxRow,
  context: BrainContextPacket,
  result: CandidateConversionResult,
  userIntent: boolean,
): Promise<void> {
  const dossier = await researchStyle(row, context);
  if (!dossier || dossier.strength < RADAR_UNDERFILLED_PROMOTION_FLOOR) {
    await markCandidate(supabase, userId, row.id, {
      status: "evaluated",
      reason: {
        summary: dossier
          ? `Style candidate held below the surfacing bar (${dossier.strength.toFixed(2)}).`
          : "Style candidate needs enrichment before surfacing.",
        category: "finds",
        source: "candidate_research",
      },
    });
    result.needsEnrichment++;
    return;
  }

  // Dedup against an existing style card with the same title.
  const { data: existing } = await supabase
    .from("surfaced_items")
    .select("id")
    .eq("user_id", userId)
    .eq("category", "finds")
    .ilike("title", row.title)
    .not("status", "in", "(archived,passed)")
    .limit(1);
  if (((existing ?? []) as Array<{ id: string }>)[0]?.id) {
    await markCandidate(supabase, userId, row.id, {
      status: "duplicate",
      rejection_reason: "Style item already surfaced.",
    });
    result.duplicates++;
    return;
  }

  const url = dossier.where_to_buy ?? row.url ?? null;
  const { error } = await supabase
    .from("surfaced_items")
    .insert({
      user_id: userId,
      destination: "radar",
      // Owner-requested style surfaces as shown; agent-discovered style enters
      // the discovered → promotion queue like everything else.
      status: userIntent ? "shown" : "discovered",
      source: userIntent ? "user_intent" : "category_agent",
      source_id: row.id,
      type: "product",
      category: "finds",
      title: row.title,
      subtitle: dossier.price,
      description: dossier.verdict,
      url,
      image_url: httpOrNull(row.image_url),
      score: dossier.strength,
      planning_state: userIntent ? "saved_to_radar" : "observed",
      reasons: [dossier.why].filter(Boolean),
      tags: tags(row),
      payload: {
        source_layer: "style_research",
        where_to_buy: dossier.where_to_buy,
        price: dossier.price,
        user_intent: userIntent,
      } as unknown as Json,
    });
  if (error) throw new Error(`style surfaced_items insert failed: ${error.message}`);

  await markCandidate(supabase, userId, row.id, {
    status: "library",
    reason: {
      summary: `Researched and surfaced style item (${dossier.strength.toFixed(2)}).`,
      category: "finds",
      quality_score: dossier.strength,
      user_intent: userIntent,
      source: "candidate_research",
    },
  });
  result.styleSurfaced++;
}

const STYLE_VERDICT_PROMPT = `You are Jarvis's STYLE editor. You take a product/drop and form the owner's take on whether it belongs in his rotation.

Voice: the owner's chief of staff — confident, concise, refined. No hype, no hedging.

RULES
- verdict: 2-4 sentences. What it is and whether it's worth the buy.
- strength: 0..1 conviction it belongs in his rotation. 0.85+ = clearly worth it; 0.58-0.84 = solid; below 0.52 = skip / not worth surfacing.
- why: one sentence on why now / why him.
- where_to_buy: a real purchase URL if present in sources, else null. Never invent a URL.
- price: a short price string ("$$", "$420") if grounded in sources, else null.
- Honor the Taste Constitution: loud-logo, fast-fashion, hype-coded items skew low.
Return strict JSON: { "verdict": string, "strength": number, "why": string, "where_to_buy": string|null, "price": string|null }`;

async function researchStyle(row: RadarCandidateInboxRow, context: BrainContextPacket): Promise<StyleVerdict | null> {
  if (!hasAnthropic()) return null;
  const searchQuery = stringValue(readRaw(row, ["search_query"])) ?? "";
  let sources: Array<{ url: string; title: string; snippet: string }> = [];
  let answer: string | null = null;
  let fallbackUrl: string | null = null;
  if (hasTavily()) {
    try {
      const res = await searchWeb({
        query: `${row.title} ${searchQuery} review where to buy price`.trim(),
        maxResults: 5,
      });
      answer = res.answer ?? null;
      sources = res.results.map((r) => ({ url: r.url, title: r.title, snippet: r.content.slice(0, 400) }));
      fallbackUrl = res.results[0]?.url ?? null;
    } catch {
      // best-effort
    }
  }
  try {
    const out = await generateStructured<StyleVerdict>({
      system: STYLE_VERDICT_PROMPT,
      prompt: JSON.stringify(
        {
          product: row.title,
          brief: typeof row.description === "string" ? row.description : null,
          answer,
          sources,
          founder_vibe: context.founder.vibeKeywords,
          founder_avoid: context.founder.avoidKeywords,
          taste_principles: context.founder.pinnedPrinciples,
        },
        null,
        2,
      ),
      schemaName: "StyleVerdict",
      temperature: 0.3,
      maxTokens: 1200,
    });
    return {
      verdict: out.verdict ?? row.description ?? row.title,
      strength: clamp01(out.strength ?? 0),
      why: out.why ?? "",
      where_to_buy: stringValue(out.where_to_buy) ?? fallbackUrl,
      price: stringValue(out.price),
    };
  } catch {
    return null;
  }
}

// ── Shared helpers ──────────────────────────────────────────────────────────────

function buildMinimalContext(founder: Partial<FounderProfileRow> | null): BrainContextPacket {
  return {
    now: new Date().toISOString(),
    founder: {
      vibeKeywords: arrayValue(founder?.vibe_keywords),
      avoidKeywords: arrayValue(founder?.avoid_keywords),
      dealbreakers: arrayValue(founder?.dealbreakers),
      pinnedPrinciples: arrayValue(founder?.pinned_principles),
    },
    memory: [],
    recentSignals: [],
    recentActions: [],
    northTags: [],
    northPillars: [],
    people: [],
  };
}

function classifyCandidateForRadar(
  row: RadarCandidateInboxRow,
  category: RadarCategory | null,
) {
  return normalizeRadarClassification({
    category,
    type: stringValue(readRaw(row, ["type"])) ?? row.entity_type,
    title: row.title,
    description: row.description,
    entityType: row.entity_type,
    placeType:
      stringValue(readRaw(row, ["place_type"])) ??
      stringValue(readRaw(row, ["quick_classification"])),
    venueType:
      stringValue(readRaw(row, ["venue_type"])) ??
      stringValue(readRaw(row, ["event_type"])),
    moveKind: stringValue(readRaw(row, ["move_kind"])),
    sequence: stringValue(readRaw(row, ["sequence"])),
    startsAt: readStartsAt(row),
    tags: tags(row),
    sourcePayload: row.raw_payload,
  });
}

async function markCandidate(
  supabase: SupabaseClient,
  userId: string,
  id: string,
  patch: { status: string; reason?: Json | null; rejection_reason?: string | null },
) {
  await supabase
    .from("radar_candidate_inbox")
    .update({
      ...patch,
      evaluated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", userId);
}

function classifyCandidate(row: RadarCandidateInboxRow): "place" | "event" | "source" | "other" {
  if (row.entity_type === "place" || row.entity_type === "event" || row.entity_type === "source") return row.entity_type;
  const text = [row.title, row.description, ...tags(row)].join(" ").toLowerCase();
  if (/source|newsletter|publication|calendar|blog|instagram/.test(text)) return "source";
  if (/event|concert|game|show|festival|ticket|tonight|weekend/.test(text)) return "event";
  if (/restaurant|bar|cafe|place|park|gym|lounge|venue|dining|food/.test(text)) return "place";
  return "other";
}

function negativeFilter(row: RadarCandidateInboxRow, avoid: string[]): string | null {
  const text = [row.title, row.description, ...tags(row)].join(" ").toLowerCase();
  const hit = avoid.find((entry) => {
    const value = entry.trim().toLowerCase();
    return value.length > 1 && text.includes(value);
  });
  return hit ? `Rejected by imported/founder negative filter: ${hit}.` : null;
}

function normalizedScore(row: RadarCandidateInboxRow): number {
  if (typeof row.score === "number") return clamp01(row.score);
  const tagsValue = tags(row);
  if (tagsValue.includes("needs_enrichment")) return 0.52;
  if (row.entity_type === "place" || row.entity_type === "event") return 0.62;
  return 0.55;
}

function readStartsAt(row: RadarCandidateInboxRow): string | null {
  const startsAt =
    stringValue(readRaw(row, ["startsAt"])) ??
    stringValue(readRaw(row, ["starts_at"])) ??
    stringValue(readRaw(row, ["payload", "dates", "start", "dateTime"])) ??
    dateWithTime(
      stringValue(readRaw(row, ["payload", "dates", "start", "localDate"])),
      stringValue(readRaw(row, ["payload", "dates", "start", "localTime"])),
    );
  if (!startsAt) return null;
  const date = new Date(startsAt);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function readVenue(row: RadarCandidateInboxRow): string | null {
  return (
    stringValue(readRaw(row, ["_embedded", "venues", "0", "name"])) ??
    stringValue(readRaw(row, ["venueName"])) ??
    null
  );
}

function readNeighborhood(row: RadarCandidateInboxRow): string | null {
  return (
    stringValue(readRaw(row, ["neighborhood"])) ??
    stringValue(readRaw(row, ["payload", "shortFormattedAddress"])) ??
    stringValue(readRaw(row, ["payload", "formattedAddress"])) ??
    null
  );
}

function dateWithTime(date: string | null, time: string | null): string | null {
  if (!date || !time) return null;
  return `${date}T${time}`;
}

function httpOrNull(value: unknown): string | null {
  return typeof value === "string" && value.startsWith("http") ? value : null;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
