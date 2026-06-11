import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { hasAnthropic } from "@/lib/ai/anthropic";
import { generateStructured } from "@/lib/ai/structured";
import { buildBrainContext } from "@/lib/brain/context";
import { buildAgentTasteBlock, type AgentTaste } from "@/lib/brain/categoryAgents";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { normalizeExternalId } from "@/lib/radar/engine/curation";
import { DINING_SUBLIBRARIES, type SubLibraryConfig } from "@/lib/radar/engine/sources";
import { getTasteCanon } from "@/lib/taste/references";

export type ScoutResult = {
  subLibrary: string;
  proposed: number;
  added: number;
  skippedExisting: number;
  errors: string[];
};

type ScoutCandidate = { name: string; sub_type?: string; neighborhood?: string };

/** Stage 1 — scout one sub-library wide from its specialist sources, dedup by
 *  external_id, and write NEW candidates as status='discovered'. */
export async function scoutSubLibrary(input: {
  userId: string;
  subLibrary: string;
  supabase?: SupabaseClient;
  target?: number;
}): Promise<ScoutResult> {
  const config = DINING_SUBLIBRARIES[input.subLibrary];
  const result: ScoutResult = {
    subLibrary: input.subLibrary,
    proposed: 0,
    added: 0,
    skippedExisting: 0,
    errors: [],
  };
  if (!config) {
    result.errors.push(`Unknown sub-library: ${input.subLibrary}`);
    return result;
  }
  if (!hasAnthropic()) {
    result.errors.push("ANTHROPIC_API_KEY not set — scout skipped");
    return result;
  }

  const supabase = input.supabase ?? getSupabaseServiceClient();
  const target = input.target ?? 50;

  const brain = await buildBrainContext({ userId: input.userId, includeWeather: false, supabase });
  const city = brain.homeCity?.trim() || "Chicago";
  const taste: AgentTaste = {
    displayName: brain.founder?.displayName ?? null,
    city,
    lifeDirection: brain.founder?.lifeDirection ?? null,
    currentFocus: brain.founder?.currentFocus ?? null,
    vibeKeywords: brain.founder?.vibeKeywords ?? [],
    avoidKeywords: brain.founder?.avoidKeywords ?? [],
    dealbreakers: brain.founder?.dealbreakers ?? [],
    pinnedPrinciples: brain.founder?.pinnedPrinciples ?? [],
    memories: (brain.memory ?? []).map((m) => ({ content: m.content, kind: m.kind })),
    northTags: brain.northTags ?? [],
  };

  // Existing external_ids in this sub-library — the permanent record. Already
  // seen = skip (the library grows forever, never repeats the pipeline).
  const existing = new Set<string>();
  const existingNames: string[] = [];
  {
    const { data, error } = await supabase
      .from(config.subLibrary)
      .select("external_id, name")
      .eq("user_id", input.userId)
      .limit(2000);
    if (error) result.errors.push(`read existing: ${error.message}`);
    for (const row of (data ?? []) as Array<{ external_id: string | null; name: string | null }>) {
      if (row.external_id) existing.add(row.external_id);
      if (row.name) existingNames.push(row.name);
    }
  }

  const canon = await getTasteCanon({ userId: input.userId, lane: config.lane, supabase });

  let proposed: ScoutCandidate[];
  try {
    proposed = await proposeCandidates(config, taste, city, target, existingNames, canon.block);
  } catch (error) {
    result.errors.push(`scout LLM: ${error instanceof Error ? error.message : String(error)}`);
    return result;
  }
  result.proposed = proposed.length;

  // Dedup (vs library + within batch) and insert NEW rows.
  const batchSeen = new Set<string>();
  const rows: Array<Record<string, unknown>> = [];
  for (const candidate of proposed) {
    const name = candidate.name?.trim();
    if (!name) continue;
    const externalId = normalizeExternalId(name);
    if (!externalId) continue;
    if (existing.has(externalId) || batchSeen.has(externalId)) {
      result.skippedExisting += 1;
      continue;
    }
    batchSeen.add(externalId);
    rows.push({
      user_id: input.userId,
      external_id: externalId,
      name,
      lane: config.lane,
      sub_type: candidate.sub_type?.trim() || null,
      neighborhood: candidate.neighborhood?.trim() || null,
      status: "discovered",
    });
  }

  if (rows.length > 0) {
    const { error } = await supabase.from(config.subLibrary).insert(rows);
    if (error) result.errors.push(`insert: ${error.message}`);
    else result.added = rows.length;
  }

  return result;
}

/** Scout all dining sub-libraries. */
export async function scoutDining(input: {
  userId: string;
  supabase?: SupabaseClient;
  target?: number;
}): Promise<ScoutResult[]> {
  const supabase = input.supabase ?? getSupabaseServiceClient();
  const results: ScoutResult[] = [];
  for (const subLibrary of Object.keys(DINING_SUBLIBRARIES)) {
    results.push(await scoutSubLibrary({ userId: input.userId, subLibrary, supabase, target: input.target }));
  }
  return results;
}

async function proposeCandidates(
  config: SubLibraryConfig,
  taste: AgentTaste,
  city: string,
  target: number,
  existingNames: string[],
  canonBlock: string,
): Promise<ScoutCandidate[]> {
  const system = [
    `You are the SCOUT for the "${config.label}" sub-library in ${city}.`,
    config.brief,
    `You fish from these specialist sources first: ${config.specialistSources.join(", ")}.`,
    "You propose REAL, currently-open, specific venues by name — never invent, never generic.",
    "Cast wide: the pipeline kills a lot downstream, so volume matters here. Quality over hype, always.",
    "NEGATIVE FILTER AT THE SOURCE: do NOT propose anything clubby, flashy, try-hard, touristy, corny, or generic — " +
      "or anything matching his dealbreakers or resembling a NO reference. Those don't enter the pool at all. Polished garbage is still garbage.",
  ].join("\n");

  const avoidList = existingNames.slice(0, 300);
  const prompt = [
    "Jerry's taste, pulled fresh:",
    buildAgentTasteBlock(taste),
    ...(canonBlock ? ["", canonBlock] : []),
    "",
    `Propose up to ${target} real ${config.label.toLowerCase()} in ${city} worth scouting into the library now.`,
    `Tag each with a sub_type from (or close to): ${config.subTypes.join(", ")}.`,
    avoidList.length
      ? `Already in the library — do NOT repeat these:\n${avoidList.join(", ")}`
      : "The library is empty — cast as wide as you can.",
    "",
    "Return strict JSON:",
    `{ "candidates": [{ "name": string, "sub_type": string, "neighborhood": string }] }`,
    "Real venue names only. No commentary, no duplicates, no closed places.",
  ].join("\n");

  const raw = await generateStructured<unknown>({
    system,
    prompt,
    schemaName: `scout_${config.subLibrary}`,
    temperature: 0.5,
    maxTokens: 4000,
  });
  return normalizeProposed(raw);
}

function normalizeProposed(raw: unknown): ScoutCandidate[] {
  const list = isRecord(raw) && Array.isArray(raw.candidates) ? raw.candidates : [];
  const out: ScoutCandidate[] = [];
  for (const entry of list) {
    if (!isRecord(entry)) continue;
    const name = typeof entry.name === "string" ? entry.name : null;
    if (!name || !name.trim()) continue;
    out.push({
      name,
      sub_type: typeof entry.sub_type === "string" ? entry.sub_type : undefined,
      neighborhood: typeof entry.neighborhood === "string" ? entry.neighborhood : undefined,
    });
  }
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
