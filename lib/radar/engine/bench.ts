import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { decayedScore, shouldDisplace } from "@/lib/radar/engine/curation";

/** Stage 11 — graduate radar_library rows → radar_bench.
 *  Applies competitive displacement and decay decay; deduplicates by name. */

export const BENCH_CAPACITY = 30; // per lane
export const BENCH_EXPIRE_DAYS = 30; // dining/finds default

export type BenchResult = {
  lane: string;
  benched: number;
  displaced: number;
  decayed: number; // rows whose decayed_score was refreshed
  errors: string[];
};

type LibraryRow = {
  id: string;
  name: string;
  sub_type: string | null;
  neighborhood: string | null;
  final_score: number | null;
};

type BenchRow = {
  id: string;
  radar_library_id: string;
  name: string;
  score: number;
  decayed_score: number;
  benched_at: string;
  status: string;
};

export async function benchLane(input: {
  userId: string;
  lane: string;
  supabase?: SupabaseClient;
  capacity?: number;
  expireDays?: number;
}): Promise<BenchResult> {
  const result: BenchResult = { lane: input.lane, benched: 0, displaced: 0, decayed: 0, errors: [] };
  const supabase = input.supabase ?? getSupabaseServiceClient();
  const capacity = input.capacity ?? BENCH_CAPACITY;
  const expireDays = input.expireDays ?? BENCH_EXPIRE_DAYS;

  // 1. Refresh decay on existing bench rows
  const { data: existing, error: existErr } = await supabase
    .from("radar_bench")
    .select("id, radar_library_id, name, score, decayed_score, benched_at, status")
    .eq("user_id", input.userId)
    .eq("lane", input.lane)
    .in("status", ["ready", "shown"]);
  if (existErr) {
    result.errors.push(`read bench: ${existErr.message}`);
    return result;
  }
  const benchRows = (existing ?? []) as BenchRow[];
  const now = new Date();

  // Refresh decayed scores and expire anything that drops below floor
  const DECAY_FLOOR = 0.3;
  for (const row of benchRows) {
    const fresh = decayedScore(row.score, row.benched_at, now);
    if (fresh < DECAY_FLOOR) {
      await supabase
        .from("radar_bench")
        .update({ status: "expired", decayed_score: fresh })
        .eq("id", row.id)
        .eq("user_id", input.userId);
    } else if (Math.abs(fresh - row.decayed_score) > 0.001) {
      await supabase
        .from("radar_bench")
        .update({ decayed_score: fresh })
        .eq("id", row.id)
        .eq("user_id", input.userId);
      result.decayed += 1;
    }
  }

  // Active bench after decay refresh (exclude newly expired)
  const activeBench = benchRows.filter((r) => decayedScore(r.score, r.benched_at, now) >= DECAY_FLOOR);

  // 2. Find radar_library rows not yet on the bench
  const benchedLibraryIds = new Set(benchRows.map((r) => r.radar_library_id));
  const { data: libData, error: libErr } = await supabase
    .from("radar_library")
    .select("id, name, sub_type, neighborhood, final_score")
    .eq("user_id", input.userId)
    .eq("lane", input.lane)
    .order("final_score", { ascending: false, nullsFirst: false });
  if (libErr) {
    result.errors.push(`read radar_library: ${libErr.message}`);
    return result;
  }
  const libRows = (libData ?? []) as LibraryRow[];
  const candidates = libRows.filter((r) => !benchedLibraryIds.has(r.id));

  if (candidates.length === 0) return result;

  // 3. For each candidate: displace or fill open slots
  const benchScores = activeBench.map((r) => decayedScore(r.score, r.benched_at, now));
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + expireDays * 86400 * 1000).toISOString();

  for (const candidate of candidates) {
    const score = candidate.final_score ?? 0;
    const openSlot = benchScores.length < capacity;

    if (openSlot) {
      await addToBench(supabase, input.userId, input.lane, candidate, score, nowIso, expiresAt);
      benchScores.push(score);
      result.benched += 1;
    } else {
      const { displace, victimIndex } = shouldDisplace(benchScores, score, capacity);
      if (displace && victimIndex !== undefined) {
        const victim = activeBench[victimIndex];
        // Expire the victim
        await supabase
          .from("radar_bench")
          .update({ status: "expired" })
          .eq("id", victim.id)
          .eq("user_id", input.userId);
        // Add the challenger
        await addToBench(supabase, input.userId, input.lane, candidate, score, nowIso, expiresAt);
        benchScores[victimIndex] = score;
        result.displaced += 1;
        result.benched += 1;
      }
    }
  }
  return result;
}

async function addToBench(
  supabase: SupabaseClient,
  userId: string,
  lane: string,
  row: LibraryRow,
  score: number,
  benchedAt: string,
  expiresAt: string,
): Promise<void> {
  await supabase.from("radar_bench").insert({
    user_id: userId,
    radar_library_id: row.id,
    lane,
    name: row.name,
    sub_type: row.sub_type,
    neighborhood: row.neighborhood,
    score,
    decayed_score: score, // starts undecayed
    status: "ready",
    benched_at: benchedAt,
    expires_at: expiresAt,
  });
}

export async function benchDining(input: {
  userId: string;
  supabase?: SupabaseClient;
}): Promise<BenchResult> {
  return benchLane({ userId: input.userId, lane: "dining", supabase: input.supabase });
}
