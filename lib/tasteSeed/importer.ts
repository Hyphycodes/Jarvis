import type { SupabaseClient } from "@supabase/supabase-js";
import type { Json } from "@/lib/types/database";
import {
  buildTasteSeedProvenance,
  parseTasteSeedMarkdown,
  slug,
  summarizeParsedTasteSeed,
  TASTE_SEED_SOURCE,
  type ParsedTasteSeed,
  type TasteSeedProvenance,
} from "@/lib/tasteSeed/parser";
import { writeIntelligenceTraceWithClient } from "@/lib/brain/intelligenceTrace";

export type TasteSeedImportMode = "dry_run" | "commit";

export type TasteSeedImportSummary = ReturnType<typeof summarizeParsedTasteSeed> & {
  wouldCreate: TasteSeedImportCounts;
  wouldUpdate: TasteSeedImportCounts;
  created: TasteSeedImportCounts;
  updated: TasteSeedImportCounts;
  skipped: TasteSeedImportCounts;
};

export type TasteSeedImportCounts = {
  people: number;
  places: number;
  upcomingEvents: number;
  tasteSignals: number;
  negativeFilters: number;
  discoverySources: number;
  notes: number;
  candidateInbox: number;
  activeRadar: number;
  traces: number;
};

export type TasteSeedImportResult = {
  ok: boolean;
  mode: TasteSeedImportMode;
  fileName: string;
  provenance: TasteSeedProvenance;
  summary: TasteSeedImportSummary;
  parsed: ParsedTasteSeed;
  traceId?: string | null;
};

const ZERO_COUNTS: TasteSeedImportCounts = {
  people: 0,
  places: 0,
  upcomingEvents: 0,
  tasteSignals: 0,
  negativeFilters: 0,
  discoverySources: 0,
  notes: 0,
  candidateInbox: 0,
  activeRadar: 0,
  traces: 0,
};

export function dryRunTasteSeedImport(input: {
  markdown: string;
  fileName?: string | null;
  importedAt?: string | Date | null;
}): TasteSeedImportResult {
  const parsed = parseTasteSeedMarkdown(input.markdown);
  const provenance = buildTasteSeedProvenance({
    fileName: input.fileName,
    importedAt: input.importedAt,
  });
  const base = summarizeParsedTasteSeed(parsed);
  const wouldCreate = countsFromParsed(parsed);
  return {
    ok: true,
    mode: "dry_run",
    fileName: provenance.source_file_name,
    provenance,
    parsed,
    summary: {
      ...base,
      wouldCreate,
      wouldUpdate: { ...ZERO_COUNTS },
      created: { ...ZERO_COUNTS },
      updated: { ...ZERO_COUNTS },
      skipped: { ...ZERO_COUNTS },
    },
  };
}

export async function commitTasteSeedImport(input: {
  userId: string;
  markdown: string;
  fileName?: string | null;
  importedAt?: string | Date | null;
  supabase: SupabaseClient;
}): Promise<TasteSeedImportResult> {
  const parsed = parseTasteSeedMarkdown(input.markdown);
  const provenance = buildTasteSeedProvenance({
    fileName: input.fileName,
    importedAt: input.importedAt,
  });
  const counts = {
    created: { ...ZERO_COUNTS },
    updated: { ...ZERO_COUNTS },
    skipped: { ...ZERO_COUNTS },
  };

  for (const person of parsed.people) {
    countResult(counts, "people", await upsertCirclePerson(input.supabase, input.userId, person, provenance));
  }

  for (const event of parsed.upcomingEvents) {
    countResult(counts, "upcomingEvents", await upsertCircleUpdate(input.supabase, input.userId, event, provenance));
  }

  for (const source of parsed.discoverySources) {
    countResult(counts, "discoverySources", await upsertIntelligenceSource(input.supabase, input.userId, source, provenance));
  }

  for (const place of parsed.places) {
    countResult(counts, "places", await upsertPlace(input.supabase, input.userId, place, provenance));
  }

  for (const signal of parsed.tasteSignals) {
    countResult(counts, "tasteSignals", await upsertTasteSignal(input.supabase, input.userId, signal, provenance));
  }

  for (const filter of parsed.negativeFilters) {
    countResult(counts, "negativeFilters", await upsertTasteSignal(input.supabase, input.userId, filter, provenance));
  }

  for (const note of parsed.notes) {
    countResult(counts, "notes", await upsertMemoryItem(input.supabase, input.userId, note, provenance));
  }

  await mergeFounderAvoidKeywords(input.supabase, input.userId, parsed.negativeFilters.map((filter) => filter.trait));

  const traceId = await writeImportTrace(input.supabase, input.userId, parsed, provenance, counts);
  if (traceId) counts.created.traces = 1;
  else counts.skipped.traces = 1;

  const base = summarizeParsedTasteSeed(parsed);
  return {
    ok: true,
    mode: "commit",
    fileName: provenance.source_file_name,
    provenance,
    parsed,
    traceId,
    summary: {
      ...base,
      wouldCreate: { ...ZERO_COUNTS },
      wouldUpdate: { ...ZERO_COUNTS },
      created: counts.created,
      updated: counts.updated,
      skipped: counts.skipped,
    },
  };
}

function countsFromParsed(parsed: ParsedTasteSeed): TasteSeedImportCounts {
  return {
    people: parsed.people.length,
    places: parsed.places.length,
    upcomingEvents: parsed.upcomingEvents.length,
    tasteSignals: parsed.tasteSignals.length,
    negativeFilters: parsed.negativeFilters.length,
    discoverySources: parsed.discoverySources.length,
    notes: parsed.notes.length,
    candidateInbox: 0,
    activeRadar: 0,
    traces: 1,
  };
}

async function upsertCirclePerson(
  supabase: SupabaseClient,
  userId: string,
  person: ParsedTasteSeed["people"][number],
  provenance: TasteSeedProvenance,
): Promise<"created" | "updated" | "skipped"> {
  const { data: existing, error: readError } = await supabase
    .from("circle_people")
    .select("id,notes")
    .eq("user_id", userId)
    .eq("name", person.name)
    .maybeSingle();
  if (readError) return "skipped";
  const notes = mergeStrings(
    Array.isArray((existing as { notes?: unknown } | null)?.notes)
      ? ((existing as { notes?: string[] }).notes ?? [])
      : [],
    person.notes,
    [`Provenance: ${provenance.source} (${provenance.source_file_name})`],
  );
  const row = {
    user_id: userId,
    name: person.name,
    category: person.category,
    role: person.role ?? null,
    closeness_score: person.closenessScore,
    current_thread: person.groupContext ?? null,
    neighborhood: person.neighborhood ?? null,
    notes,
    updated_at: provenance.imported_at,
  };
  if ((existing as { id?: string } | null)?.id) {
    const { error } = await supabase
      .from("circle_people")
      .update(row)
      .eq("id", (existing as { id: string }).id)
      .eq("user_id", userId);
    return error ? "skipped" : "updated";
  }
  const { error } = await supabase.from("circle_people").insert(row);
  return error ? "skipped" : "created";
}

async function upsertCircleUpdate(
  supabase: SupabaseClient,
  userId: string,
  event: ParsedTasteSeed["upcomingEvents"][number],
  provenance: TasteSeedProvenance,
): Promise<"created" | "updated" | "skipped"> {
  const title = event.dateText ? `${event.title} (${event.dateText})` : event.title;
  const summary = [
    ...event.notes,
    event.ambiguousDate ? "Date is contextual/ambiguous; do not invent an exact timestamp." : null,
    event.people.length ? `People: ${event.people.join(", ")}` : null,
  ].filter(Boolean).join(" ");
  const { data: existing, error: readError } = await supabase
    .from("circle_updates")
    .select("id")
    .eq("user_id", userId)
    .eq("title", title)
    .eq("source", TASTE_SEED_SOURCE)
    .maybeSingle();
  if (readError) return "skipped";
  const row = {
    user_id: userId,
    person_id: null,
    title,
    summary,
    suggested_action: event.suggestedAction ?? "Use as Circle/Today planning context.",
    urgency: "medium",
    source: TASTE_SEED_SOURCE,
    updated_at: provenance.imported_at,
  };
  if ((existing as { id?: string } | null)?.id) {
    const { error } = await supabase
      .from("circle_updates")
      .update(row)
      .eq("id", (existing as { id: string }).id)
      .eq("user_id", userId);
    return error ? "skipped" : "updated";
  }
  const { error } = await supabase.from("circle_updates").insert(row);
  return error ? "skipped" : "created";
}

async function upsertPlace(
  supabase: SupabaseClient,
  userId: string,
  place: ParsedTasteSeed["places"][number],
  provenance: TasteSeedProvenance,
): Promise<"created" | "updated" | "skipped"> {
  const placeSlug = slug(place.name);
  const { data: existing, error: readError } = await supabase
    .from("places_library")
    .select("id")
    .eq("user_id", userId)
    .eq("slug", placeSlug)
    .maybeSingle();
  if (readError) return "skipped";
  const sourceId = await findTasteSeedSourceId(supabase, userId);
  const row = {
    user_id: userId,
    name: place.name,
    slug: placeSlug,
    place_type: inferPlaceType(place.tags),
    neighborhood: place.neighborhood,
    address: null,
    cuisine_or_focus: inferCuisine(place.tags, place.notes.join(" ")),
    price_level: place.priceNote,
    vibe_keywords: place.tags,
    sources_cited: [{
      ...provenance,
      note: "Owner-provided taste seed; not external verification.",
    }] as Json,
    verdict: buildPlaceVerdict(place),
    verdict_strength: place.qualityScore,
    best_for: place.useCases,
    not_for: place.guardrails,
    compared_to: place.signals.find((line) => /same as|similar|compared/i.test(line)) ?? null,
    events_observed: [{
      source: provenance.source,
      notes: place.notes,
      signals: place.signals,
      would_return: place.wouldReturn,
      needs_enrichment: place.tags.includes("needs_enrichment"),
    }] as Json,
    seasonal_notes: place.notes.find((line) => /summer|warm weather|Sunday/i.test(line)) ?? null,
    quality_tier: qualityTier(place.qualityScore),
    quality_score: place.qualityScore,
    source_id: sourceId,
    last_researched_at: provenance.imported_at,
    last_refreshed_at: provenance.imported_at,
    updated_at: provenance.imported_at,
  };
  const { data, error } = await supabase
    .from("places_library")
    .upsert(row, { onConflict: "user_id,slug" })
    .select("id")
    .single();
  if (error) return "skipped";
  const id = (data as { id?: string } | null)?.id;
  if (!id) return "skipped";
  return (existing as { id?: string } | null)?.id ? "updated" : "created";
}

async function upsertTasteSignal(
  supabase: SupabaseClient,
  userId: string,
  signal: ParsedTasteSeed["tasteSignals"][number] | ParsedTasteSeed["negativeFilters"][number],
  provenance: TasteSeedProvenance,
): Promise<"created" | "updated" | "skipped"> {
  const { data: existing, error: readError } = await supabase
    .from("taste_signals")
    .select("id,frequency,metadata")
    .eq("user_id", userId)
    .eq("trait", signal.trait)
    .eq("direction", signal.direction)
    .eq("source", TASTE_SEED_SOURCE)
    .maybeSingle();
  if (readError) return "skipped";
  const existingFrequency = Number((existing as { frequency?: number } | null)?.frequency ?? 0);
  const row = {
    user_id: userId,
    trait: signal.trait,
    direction: signal.direction,
    category: signal.category,
    weight: signal.weight,
    confidence: signal.confidence,
    frequency: Math.max(1, existingFrequency + 1),
    last_reinforced_at: provenance.imported_at,
    source: TASTE_SEED_SOURCE,
    metadata: {
      ...asRecord(signal.metadata),
      provenance,
    } as Json,
    updated_at: provenance.imported_at,
  };
  if ((existing as { id?: string } | null)?.id) {
    const { error } = await supabase
      .from("taste_signals")
      .update(row)
      .eq("id", (existing as { id: string }).id)
      .eq("user_id", userId);
    return error ? "skipped" : "updated";
  }
  const { error } = await supabase.from("taste_signals").insert(row);
  return error ? "skipped" : "created";
}

async function upsertMemoryItem(
  supabase: SupabaseClient,
  userId: string,
  note: ParsedTasteSeed["notes"][number],
  provenance: TasteSeedProvenance,
): Promise<"created" | "updated" | "skipped"> {
  const { data: existing, error: readError } = await supabase
    .from("memory_items")
    .select("id,frequency,tags")
    .eq("user_id", userId)
    .eq("content", note.content)
    .eq("source", TASTE_SEED_SOURCE)
    .maybeSingle();
  if (readError) return "skipped";
  const existingFrequency = Number((existing as { frequency?: number } | null)?.frequency ?? 0);
  const existingTags = Array.isArray((existing as { tags?: unknown } | null)?.tags)
    ? ((existing as { tags?: string[] }).tags ?? [])
    : [];
  const row = {
    user_id: userId,
    content: note.content,
    kind: note.kind,
    status: "active",
    confidence: note.confidence,
    frequency: Math.max(1, existingFrequency + 1),
    last_reinforced_at: provenance.imported_at,
    source: TASTE_SEED_SOURCE,
    is_pinned: note.tags.includes("spelling") || note.tags.includes("guardrail"),
    tags: mergeStrings(existingTags, note.tags, ["taste_seed"]),
    metadata: { provenance } as Json,
    updated_at: provenance.imported_at,
  };
  if ((existing as { id?: string } | null)?.id) {
    const { error } = await supabase
      .from("memory_items")
      .update(row)
      .eq("id", (existing as { id: string }).id)
      .eq("user_id", userId);
    return error ? "skipped" : "updated";
  }
  const { error } = await supabase.from("memory_items").insert(row);
  return error ? "skipped" : "created";
}

async function upsertIntelligenceSource(
  supabase: SupabaseClient,
  userId: string,
  source: ParsedTasteSeed["discoverySources"][number],
  provenance: TasteSeedProvenance,
): Promise<"created" | "updated" | "skipped"> {
  const now = provenance.imported_at;
  const { data: existing, error: readError } = await supabase
    .from("intelligence_sources")
    .select("id,total_candidates,total_library_items,topics,metadata")
    .eq("user_id", userId)
    .eq("source_key", source.key)
    .maybeSingle();
  if (readError) return "skipped";
  const row = {
    user_id: userId,
    source_key: source.key,
    source_type: source.sourceType,
    url: null,
    domain: null,
    name: source.name,
    city: source.topics.includes("chicago") ? "Chicago" : null,
    topics: mergeStrings(
      Array.isArray((existing as { topics?: unknown } | null)?.topics)
        ? ((existing as { topics?: string[] }).topics ?? [])
        : [],
      source.topics,
      ["taste_seed"],
    ),
    trust_score: source.trustScore,
    taste_fit_score: source.tasteFitScore,
    novelty_score: 0.58,
    freshness_score: 0.55,
    total_candidates: Number((existing as { total_candidates?: number } | null)?.total_candidates ?? 0),
    total_library_items: Number((existing as { total_library_items?: number } | null)?.total_library_items ?? 0),
    cadence_hours: source.status === "watching" ? 24 : 72,
    status: source.status,
    next_check_at: source.status === "watching" ? addHours(now, 24) : addHours(now, 72),
    metadata: {
      ...asRecord((existing as { metadata?: Json } | null)?.metadata),
      notes: source.notes,
      provenance,
      needs_enrichment: true,
    } as Json,
    updated_at: now,
  };
  if ((existing as { id?: string } | null)?.id) {
    const { error } = await supabase
      .from("intelligence_sources")
      .update(row)
      .eq("id", (existing as { id: string }).id)
      .eq("user_id", userId);
    return error ? "skipped" : "updated";
  }
  const { error } = await supabase.from("intelligence_sources").insert(row);
  return error ? "skipped" : "created";
}

async function mergeFounderAvoidKeywords(
  supabase: SupabaseClient,
  userId: string,
  filters: string[],
): Promise<void> {
  if (filters.length === 0) return;
  const { data } = await supabase
    .from("founder_profile")
    .select("user_id,avoid_keywords")
    .eq("user_id", userId)
    .maybeSingle();
  const existing = Array.isArray((data as { avoid_keywords?: unknown } | null)?.avoid_keywords)
    ? ((data as { avoid_keywords?: string[] }).avoid_keywords ?? [])
    : [];
  await supabase.from("founder_profile").upsert({
    user_id: userId,
    avoid_keywords: mergeStrings(existing, filters),
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
}

async function findTasteSeedSourceId(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("intelligence_sources")
    .select("id")
    .eq("user_id", userId)
    .like("source_key", "taste_seed_source:%")
    .order("trust_score", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

async function writeImportTrace(
  supabase: SupabaseClient,
  userId: string,
  parsed: ParsedTasteSeed,
  provenance: TasteSeedProvenance,
  counts: { created: TasteSeedImportCounts; updated: TasteSeedImportCounts; skipped: TasteSeedImportCounts },
): Promise<string | null> {
  try {
    return await writeIntelligenceTraceWithClient({
      userId,
      route: "lib/tasteSeed/importer.commitTasteSeedImport",
      surface: "scout",
      decisionType: "taste_seed_import",
      contextSummary: {
        provenance,
        imported_counts: summarizeParsedTasteSeed(parsed),
      } as Json,
      reasoning: {
        summary: "Owner-provided taste seed routed into existing Circle, Library, Source Graph, memory, and taste signal systems.",
        contextFactors: [
          "First-party owner-provided data",
          "Imported records are anchors and priors, not static Radar recommendations",
          "Ambiguous dates kept as Circle planning context",
        ],
        confidence: 0.96,
      },
      selectedCandidate: {
        created: counts.created,
        updated: counts.updated,
        skipped: counts.skipped,
      } as Json,
      confidence: 0.96,
      outcome: "Taste seed import completed.",
    }, supabase) as string | null;
  } catch {
    return null;
  }
}

function buildPlaceVerdict(place: ParsedTasteSeed["places"][number]): string {
  return [
    place.whyLiked.length ? place.whyLiked.join(" ") : null,
    place.signals.length ? `Signals: ${place.signals.join(" ")}` : null,
    place.guardrails.length ? `Guardrails: ${place.guardrails.join(" ")}` : null,
    "Imported as owner-provided Library context, not an automatic Radar recommendation.",
  ].filter(Boolean).join(" ");
}

function inferPlaceType(tags: string[]): string {
  if (tags.includes("activity") || tags.includes("outdoor")) return "activity";
  if (tags.includes("cigar")) return "cigar";
  return "restaurant";
}

function inferCuisine(tags: string[], text: string): string | null {
  if (tags.includes("mexican")) return "Mexican";
  if (tags.includes("japanese")) return "Japanese";
  if (tags.includes("mediterranean")) return "Mediterranean";
  if (tags.includes("brazilian")) return "Brazilian";
  if (/middle eastern/i.test(text)) return "Middle Eastern";
  return null;
}

function qualityTier(score: number): "A" | "B" | "C" {
  if (score >= 0.76) return "A";
  if (score >= 0.6) return "B";
  return "C";
}

function countResult(
  counts: { created: TasteSeedImportCounts; updated: TasteSeedImportCounts; skipped: TasteSeedImportCounts },
  key: keyof TasteSeedImportCounts,
  result: "created" | "updated" | "skipped",
) {
  counts[result][key]++;
}

function mergeStrings(...groups: Array<string[] | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const group of groups) {
    for (const value of group ?? []) {
      const cleaned = value.trim();
      if (!cleaned) continue;
      const key = cleaned.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(cleaned);
    }
  }
  return out;
}

function asRecord(value: unknown): Record<string, Json> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, Json>
    : {};
}

function addHours(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * 60 * 60 * 1000).toISOString();
}
