/**
 * Moves category editor (per jarvis-moves-engine-brain-tree.md) — assembles a
 * BALANCED shelf across sub-libraries + effort, so it's not 7 workouts or 7 walks.
 * Pure + unit-tested.
 */

export type MoveShelfCandidate = {
  id: string;
  sub_library: string | null;
  energy_required?: string | null; // low | medium | high
  final_score: number | null;
};

export type MovesShelf<T extends MoveShelfCandidate> = {
  featured: T[];
  reserve: T[];
};

export function selectMovesShelf<T extends MoveShelfCandidate>(
  candidates: T[],
  opts: { limit?: number; maxPerSubLibrary?: number; maxPerEnergy?: number } = {},
): MovesShelf<T> {
  const limit = opts.limit ?? 7;
  const maxPerSubLibrary = opts.maxPerSubLibrary ?? 2;
  const maxPerEnergy = opts.maxPerEnergy ?? 4;

  const ranked = [...candidates].sort((a, b) => (b.final_score ?? 0) - (a.final_score ?? 0));

  const featured: T[] = [];
  const reserve: T[] = [];
  const subCount = new Map<string, number>();
  const energyCount = new Map<string, number>();

  for (const c of ranked) {
    if (featured.length >= limit) {
      reserve.push(c);
      continue;
    }
    const sub = c.sub_library ?? "unknown";
    const energy = c.energy_required ?? "unknown";
    if ((subCount.get(sub) ?? 0) >= maxPerSubLibrary) {
      reserve.push(c);
      continue;
    }
    if ((energyCount.get(energy) ?? 0) >= maxPerEnergy) {
      reserve.push(c);
      continue;
    }
    featured.push(c);
    subCount.set(sub, (subCount.get(sub) ?? 0) + 1);
    energyCount.set(energy, (energyCount.get(energy) ?? 0) + 1);
  }
  return { featured, reserve };
}
