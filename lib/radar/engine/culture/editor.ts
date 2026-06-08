/**
 * Culture category editor (per jarvis-culture-engine-brain-tree.md) — assembles a
 * BALANCED shelf: sub-library variety (exhibits/performances/screenings/arch),
 * timeless-vs-dated balance, no institution spam, depth-weighted. Pure + tested.
 */

export type CultureShelfCandidate = {
  id: string;
  sub_library: string | null;
  institution: string | null;
  final_score: number | null;
  depth_score?: number | null;
  is_dated?: boolean | null;
};

export type CultureShelf<T extends CultureShelfCandidate> = {
  featured: T[];
  reserve: T[];
};

export function selectCultureShelf<T extends CultureShelfCandidate>(
  candidates: T[],
  opts: { limit?: number; maxPerSubLibrary?: number; maxPerInstitution?: number; maxDated?: number } = {},
): CultureShelf<T> {
  const limit = opts.limit ?? 7;
  const maxPerSubLibrary = opts.maxPerSubLibrary ?? 2;
  const maxPerInstitution = opts.maxPerInstitution ?? 1;
  const maxDated = opts.maxDated ?? 4; // keep the shelf mostly evergreen

  // Rank by score nudged by depth (substance beats a slightly higher shallow score).
  const ranked = [...candidates].sort((a, b) => eff(b) - eff(a));

  const featured: T[] = [];
  const reserve: T[] = [];
  const subCount = new Map<string, number>();
  const instCount = new Map<string, number>();
  let datedCount = 0;

  for (const c of ranked) {
    if (featured.length >= limit) {
      reserve.push(c);
      continue;
    }
    const sub = c.sub_library ?? "unknown";
    const inst = (c.institution ?? "").toLowerCase().trim();
    if ((subCount.get(sub) ?? 0) >= maxPerSubLibrary) {
      reserve.push(c);
      continue;
    }
    if (inst && (instCount.get(inst) ?? 0) >= maxPerInstitution) {
      reserve.push(c);
      continue;
    }
    if (c.is_dated && datedCount >= maxDated) {
      reserve.push(c);
      continue;
    }
    featured.push(c);
    subCount.set(sub, (subCount.get(sub) ?? 0) + 1);
    if (inst) instCount.set(inst, (instCount.get(inst) ?? 0) + 1);
    if (c.is_dated) datedCount += 1;
  }
  return { featured, reserve };
}

function eff(c: CultureShelfCandidate): number {
  const base = typeof c.final_score === "number" && Number.isFinite(c.final_score) ? c.final_score : 0;
  const depthBump = typeof c.depth_score === "number" ? c.depth_score * 0.1 : 0;
  return base + depthBump;
}
