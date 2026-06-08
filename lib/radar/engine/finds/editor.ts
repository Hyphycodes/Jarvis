/**
 * Finds category editor (per jarvis-finds-engine-brain-tree.md) — Finds needs the
 * STRONGEST dedup of any lane. No Charvet wall, no watch wall, no luxury flood.
 * Dedup by exact title / product URL / brand+family, then cap per brand-family,
 * per source-brain, and aspirational. User-requested items bypass the caps.
 * Pure + unit-tested.
 */

export type FindShelfCandidate = {
  id: string;
  titleKey: string; // normalized title
  familyKey: string; // brand + product family
  productUrl?: string | null;
  sourceBrain?: string | null;
  budgetTier?: string | null; // attainable | premium_realistic | aspirational | hold
  finalScore: number | null;
  userRequested?: boolean | null;
};

export type FindsShelf<T extends FindShelfCandidate> = {
  featured: T[];
  reserve: T[];
};

export function selectFindsShelf<T extends FindShelfCandidate>(
  candidates: T[],
  opts: { limit?: number; maxPerSourceBrain?: number; maxAspirational?: number } = {},
): FindsShelf<T> {
  const limit = opts.limit ?? 7;
  const maxPerSourceBrain = opts.maxPerSourceBrain ?? 2;
  const maxAspirational = opts.maxAspirational ?? 1;

  // User-requested first, then by score — so an explicit ask always wins a slot.
  const ranked = [...candidates].sort((a, b) => {
    const req = Number(Boolean(b.userRequested)) - Number(Boolean(a.userRequested));
    if (req !== 0) return req;
    return (b.finalScore ?? 0) - (a.finalScore ?? 0);
  });

  const featured: T[] = [];
  const reserve: T[] = [];
  const seenTitle = new Set<string>();
  const seenUrl = new Set<string>();
  const seenFamily = new Set<string>();
  const brandCount = new Map<string, number>();
  let aspirationalCount = 0;

  for (const c of ranked) {
    const requested = Boolean(c.userRequested);
    // Hard dedup (applies even to user-requested — never show the exact same product twice).
    if (c.titleKey && seenTitle.has(c.titleKey)) { reserve.push(c); continue; }
    if (c.productUrl && seenUrl.has(c.productUrl)) { reserve.push(c); continue; }

    if (!requested) {
      if (featured.length >= limit) { reserve.push(c); continue; }
      if (c.familyKey && seenFamily.has(c.familyKey)) { reserve.push(c); continue; } // 1 per brand+family
      const brain = c.sourceBrain ?? "unknown";
      if ((brandCount.get(brain) ?? 0) >= maxPerSourceBrain) { reserve.push(c); continue; }
      if (c.budgetTier === "aspirational" && aspirationalCount >= maxAspirational) { reserve.push(c); continue; }
      if (c.budgetTier === "hold") { reserve.push(c); continue; } // fantasy luxury never features in background
    }

    featured.push(c);
    if (c.titleKey) seenTitle.add(c.titleKey);
    if (c.productUrl) seenUrl.add(c.productUrl);
    if (c.familyKey) seenFamily.add(c.familyKey);
    const brain = c.sourceBrain ?? "unknown";
    brandCount.set(brain, (brandCount.get(brain) ?? 0) + 1);
    if (c.budgetTier === "aspirational") aspirationalCount += 1;
  }
  return { featured, reserve };
}
