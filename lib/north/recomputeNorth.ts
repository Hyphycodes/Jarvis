/**
 * North recompute — rolls 30-day behavior into a fresh `progress` value for
 * each of the seven life pillars and writes them back to `north_pillars`.
 *
 * Reads:
 *   - behavior_signals (last 30 days, action-like signal_types)
 *   - surfaced_items (status in completed/saved/planned, updated in last 30 days)
 *
 * Each row is attributed to 0..2 pillar slugs via attributePillar(). The same
 * underlying item showing up in both sources is de-duped on (itemId, pillar) —
 * a saved item that also produced an item.save behavior signal counts once.
 *
 * Progress math (per pillar slug):
 *   - base = clamp(repCount30d / 8, 0, 1)
 *   - if any rep in the last 7 days → base *= 1.1 (cap at 1.0)
 *   - peace runs inverse: base = clamp(peaceReps30d / 6, 0, 1) — with a
 *     0.1 decay subtracted if non-peace activity in the last 7 days exceeds
 *     20 reps (i.e. the week was packed and Peace gives way).
 *   - no reps → 0.0
 *
 * Writes:
 *   - For each of the 7 pillar slugs, match an existing north_pillars row by
 *     case-insensitive title. If found → update progress + updated_at.
 *     If not found → insert with the canonical title and a default description.
 */

import "server-only";

import { getSupabaseServiceClient } from "@/lib/supabase/server";
import {
  attributePillar,
  PILLAR_SLUGS,
  type PillarSlug,
} from "@/lib/north/attributionMap";

const RECOMPUTE_WINDOW_DAYS = 30;
const RECENT_WINDOW_DAYS = 7;
const BASE_REP_TARGET = 8;
const PEACE_REP_TARGET = 6;
const RECENT_BOOST = 1.1;
const PEACE_PACKED_THRESHOLD = 20;
const PEACE_PACKED_DECAY = 0.1;

// Canonical titles that the slugs map to in north_pillars.
const PILLAR_TITLES: Record<PillarSlug, string> = {
  body: "Body",
  skill: "Skill",
  creative: "Creative",
  ownership: "Ownership",
  taste: "Taste",
  relationships: "Relationships",
  peace: "Peace",
};

const PILLAR_DESCRIPTIONS: Record<PillarSlug, string> = {
  body: "Strength, mobility, and physical edge.",
  skill: "Reps that compound — practice, learning, craft.",
  creative: "Music, visuals, craft — making things that last.",
  ownership: "Real estate, capital, durable assets.",
  taste: "Dining, culture, style — the sensory layer.",
  relationships: "Time invested in the people who matter.",
  peace: "Quiet, rest, faith — the protected baseline.",
};

// Behavior-signal types that count as a rep. The codebase uses dotted names
// (`item.save`, `radar.save`, `plan.complete`, …); we match on the action
// suffix so new dotted variants automatically count.
const REP_ACTION_SUFFIXES = new Set([
  "save",
  "plan",
  "activate",
  "generated",
  "scheduled",
  "started",
  "complete",
  "completed",
  "open",
  "viewed",
]);

// ── Types ────────────────────────────────────────────────────────────────────

type Rep = {
  pillar: PillarSlug;
  at: Date;
  /**
   * A stable key for de-duping the same item across both queries.
   * Prefer the linked item/plan id when available; fall back to the row id.
   */
  dedupeKey: string;
};

type PillarRowSubset = {
  id: string;
  title: string;
};

type BehaviorRow = {
  id: string;
  signal_type: string;
  object_id: string | null;
  subject_id: string | null;
  metadata: Record<string, unknown> | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

type SurfacedRow = {
  id: string;
  title: string | null;
  category: string | null;
  occasion_type: string | null;
  tags: string[] | null;
  updated_at: string;
};

export type RecomputeNorthSummary = {
  updated: number;
  pillarScores: Record<PillarSlug, number>;
  windowDays: number;
};

// ── Entry ────────────────────────────────────────────────────────────────────

export async function recomputeNorth(
  userId: string,
): Promise<RecomputeNorthSummary> {
  const supabase = getSupabaseServiceClient();
  const now = new Date();
  const windowStart = daysAgo(now, RECOMPUTE_WINDOW_DAYS);
  const recentStart = daysAgo(now, RECENT_WINDOW_DAYS);

  const [behaviorRes, surfacedRes, pillarsRes] = await Promise.all([
    supabase
      .from("behavior_signals")
      .select("id, signal_type, object_id, subject_id, metadata, payload, created_at")
      .eq("user_id", userId)
      .gte("created_at", windowStart.toISOString()),
    supabase
      .from("surfaced_items")
      .select("id, title, category, occasion_type, tags, updated_at")
      .eq("user_id", userId)
      .in("status", ["completed", "saved", "planned"])
      .gte("updated_at", windowStart.toISOString()),
    supabase
      .from("north_pillars")
      .select("id, title")
      .eq("user_id", userId),
  ]);

  if (behaviorRes.error) {
    console.error("[north.recompute] behavior_signals query failed", behaviorRes.error);
  }
  if (surfacedRes.error) {
    console.error("[north.recompute] surfaced_items query failed", surfacedRes.error);
  }
  if (pillarsRes.error) {
    console.error("[north.recompute] north_pillars query failed", pillarsRes.error);
  }

  const behaviorRows = (behaviorRes.data ?? []) as BehaviorRow[];
  const surfacedRows = (surfacedRes.data ?? []) as SurfacedRow[];
  const pillarRows = (pillarsRes.data ?? []) as PillarRowSubset[];

  const reps = collectReps(behaviorRows, surfacedRows);
  const dedupedReps = dedupeReps(reps);
  const pillarScores = scoreAllPillars(dedupedReps, recentStart);

  const updated = await writePillarScores({
    supabase,
    userId,
    pillarRows,
    pillarScores,
  });

  return {
    updated,
    pillarScores,
    windowDays: RECOMPUTE_WINDOW_DAYS,
  };
}

// ── Rep collection ───────────────────────────────────────────────────────────

function collectReps(
  behaviorRows: BehaviorRow[],
  surfacedRows: SurfacedRow[],
): Rep[] {
  const reps: Rep[] = [];

  for (const row of behaviorRows) {
    if (!isRepSignal(row.signal_type)) continue;
    const at = new Date(row.created_at);
    if (Number.isNaN(at.getTime())) continue;

    const metadata = row.metadata ?? {};
    const payload = row.payload ?? {};
    const slugs = attributePillar({
      category: stringFrom(metadata.category) ?? stringFrom(payload.category),
      occasion_type:
        stringFrom(metadata.occasion_type) ?? stringFrom(payload.occasion_type),
      tags: stringArrayFrom(metadata.tags) ?? stringArrayFrom(payload.tags),
      title: stringFrom(metadata.title) ?? stringFrom(payload.title),
    });

    const dedupeKey =
      row.object_id ?? row.subject_id ?? `behavior:${row.id}`;

    for (const slug of slugs) {
      reps.push({ pillar: slug, at, dedupeKey });
    }
  }

  for (const row of surfacedRows) {
    const at = new Date(row.updated_at);
    if (Number.isNaN(at.getTime())) continue;
    const slugs = attributePillar({
      category: row.category,
      occasion_type: row.occasion_type,
      tags: row.tags,
      title: row.title,
    });
    for (const slug of slugs) {
      reps.push({ pillar: slug, at, dedupeKey: row.id });
    }
  }

  return reps;
}

function isRepSignal(signalType: string): boolean {
  if (!signalType) return false;
  const suffix = signalType.includes(".")
    ? signalType.slice(signalType.lastIndexOf(".") + 1)
    : signalType;
  return REP_ACTION_SUFFIXES.has(suffix);
}

/**
 * Dedupe reps per (dedupeKey, pillar) — a saved item that also produced a
 * behavior signal should count once for each pillar it credits. Keep the
 * most recent timestamp so the 7-day recency boost stays accurate.
 */
function dedupeReps(reps: Rep[]): Rep[] {
  const byKey = new Map<string, Rep>();
  for (const rep of reps) {
    const key = `${rep.dedupeKey}::${rep.pillar}`;
    const existing = byKey.get(key);
    if (!existing || rep.at.getTime() > existing.at.getTime()) {
      byKey.set(key, rep);
    }
  }
  return Array.from(byKey.values());
}

// ── Scoring ──────────────────────────────────────────────────────────────────

function scoreAllPillars(
  reps: Rep[],
  recentStart: Date,
): Record<PillarSlug, number> {
  const totalsByPillar = new Map<PillarSlug, number>();
  const recentByPillar = new Map<PillarSlug, number>();

  for (const rep of reps) {
    totalsByPillar.set(rep.pillar, (totalsByPillar.get(rep.pillar) ?? 0) + 1);
    if (rep.at.getTime() >= recentStart.getTime()) {
      recentByPillar.set(rep.pillar, (recentByPillar.get(rep.pillar) ?? 0) + 1);
    }
  }

  const nonPeaceRecentTotal = PILLAR_SLUGS
    .filter((slug) => slug !== "peace")
    .reduce((sum, slug) => sum + (recentByPillar.get(slug) ?? 0), 0);
  const peacePacked = nonPeaceRecentTotal > PEACE_PACKED_THRESHOLD;

  const scores = {} as Record<PillarSlug, number>;
  for (const slug of PILLAR_SLUGS) {
    scores[slug] = scoreOne({
      slug,
      total: totalsByPillar.get(slug) ?? 0,
      recent: recentByPillar.get(slug) ?? 0,
      peacePacked,
    });
  }
  return scores;
}

function scoreOne(input: {
  slug: PillarSlug;
  total: number;
  recent: number;
  peacePacked: boolean;
}): number {
  if (input.total === 0) return 0;

  if (input.slug === "peace") {
    let progress = clamp01(input.total / PEACE_REP_TARGET);
    if (input.peacePacked) progress = Math.max(0, progress - PEACE_PACKED_DECAY);
    return roundTo(progress, 4);
  }

  let progress = clamp01(input.total / BASE_REP_TARGET);
  if (input.recent > 0) progress = clamp01(progress * RECENT_BOOST);
  return roundTo(progress, 4);
}

// ── Persistence ──────────────────────────────────────────────────────────────

async function writePillarScores(input: {
  supabase: ReturnType<typeof getSupabaseServiceClient>;
  userId: string;
  pillarRows: PillarRowSubset[];
  pillarScores: Record<PillarSlug, number>;
}): Promise<number> {
  const { supabase, userId, pillarRows, pillarScores } = input;
  const byTitle = new Map(pillarRows.map((row) => [row.title.toLowerCase(), row]));
  const nowIso = new Date().toISOString();

  const updates: Array<{ id: string; progress: number }> = [];
  const inserts: Array<{
    user_id: string;
    title: string;
    description: string;
    progress: number;
  }> = [];

  for (const slug of PILLAR_SLUGS) {
    const title = PILLAR_TITLES[slug];
    const existing = byTitle.get(title.toLowerCase());
    const progress = pillarScores[slug];
    if (existing) {
      updates.push({ id: existing.id, progress });
    } else {
      inserts.push({
        user_id: userId,
        title,
        description: PILLAR_DESCRIPTIONS[slug],
        progress,
      });
    }
  }

  let written = 0;

  for (const update of updates) {
    const { error } = await supabase
      .from("north_pillars")
      .update({ progress: update.progress, updated_at: nowIso })
      .eq("id", update.id);
    if (error) {
      console.error("[north.recompute] update failed", { id: update.id, error });
      continue;
    }
    written += 1;
  }

  if (inserts.length > 0) {
    const { error, count } = await supabase
      .from("north_pillars")
      .insert(inserts, { count: "exact" });
    if (error) {
      console.error("[north.recompute] insert failed", error);
    } else {
      written += count ?? inserts.length;
    }
  }

  return written;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function daysAgo(from: Date, days: number): Date {
  return new Date(from.getTime() - days * 24 * 60 * 60 * 1000);
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function roundTo(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function stringFrom(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function stringArrayFrom(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value.filter((entry): entry is string => typeof entry === "string");
  return out.length > 0 ? out : undefined;
}
