/**
 * Pure curation helpers (per radar-curation-engine.md PARTS 6/8/9): finalist
 * selection, bench decay, competitive displacement, render diversity, dedup.
 * No IO — tsx-testable. The engine's stage code calls these.
 */

/** Stage 4: take only the top slice by score — only finalists get deep-enriched. */
export function selectFinalists<T>(items: T[], score: (t: T) => number, slice: number): T[] {
  if (slice <= 0) return [];
  return [...items].sort((a, b) => score(b) - score(a)).slice(0, slice);
}

/** Bench score decay: −0.01/day from benched_at (PART 8). Fresher edges out stale. */
export const BENCH_DECAY_PER_DAY = 0.01;

export function decayedScore(score: number, benchedAtIso: string, now: Date = new Date()): number {
  const benched = Date.parse(benchedAtIso);
  if (!Number.isFinite(benched)) return score;
  const days = Math.max(0, (now.getTime() - benched) / 86_400_000);
  return score - BENCH_DECAY_PER_DAY * days;
}

/**
 * Competitive displacement (PART 8): with an open slot, always admit; when the
 * bench is full, a strictly higher candidate bumps the lowest-scored member.
 * Returns the victim index (−1 = fill an open slot, no victim).
 */
export function shouldDisplace(
  benchScores: number[],
  candidateScore: number,
  capacity: number,
): { displace: boolean; victimIndex: number } {
  if (benchScores.length < capacity) return { displace: true, victimIndex: -1 };
  if (benchScores.length === 0) return { displace: false, victimIndex: -1 };
  let minIdx = 0;
  for (let i = 1; i < benchScores.length; i++) {
    if (benchScores[i] < benchScores[minIdx]) minIdx = i;
  }
  return candidateScore > benchScores[minIdx]
    ? { displace: true, victimIndex: minIdx }
    : { displace: false, victimIndex: -1 };
}

/**
 * Render diversity (PART 9): from an already-ranked list, take up to `limit`
 * enforcing max-per-sub_type and max-per-neighborhood. Input MUST be pre-sorted
 * (e.g. decayed score desc) — this preserves order and skips over-quota items.
 */
export function enforceRenderDiversity<T>(
  items: T[],
  opts: {
    limit: number;
    maxPerSubType: number;
    maxPerNeighborhood: number;
    subType: (t: T) => string | null;
    neighborhood: (t: T) => string | null;
  },
): T[] {
  const out: T[] = [];
  const subTypeCount = new Map<string, number>();
  const neighborhoodCount = new Map<string, number>();
  for (const item of items) {
    if (out.length >= opts.limit) break;
    const st = opts.subType(item);
    const nb = opts.neighborhood(item);
    if (st && (subTypeCount.get(st) ?? 0) >= opts.maxPerSubType) continue;
    if (nb && (neighborhoodCount.get(nb) ?? 0) >= opts.maxPerNeighborhood) continue;
    out.push(item);
    if (st) subTypeCount.set(st, (subTypeCount.get(st) ?? 0) + 1);
    if (nb) neighborhoodCount.set(nb, (neighborhoodCount.get(nb) ?? 0) + 1);
  }
  return out;
}

/** Dedup key: normalized name/external id (PART 6 — already in the sub-library = skip). */
export function normalizeExternalId(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
