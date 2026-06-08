/**
 * Places category editor (per jarvis-places-engine-brain-tree.md) — assembles a
 * BALANCED shelf: sub-library variety, neighborhood spread, role variety,
 * indoor/outdoor balance (no 5 parks, no 4 hotel lobbies, no same-neighborhood
 * pile-up). Pure + unit-tested.
 */

export type PlaceShelfCandidate = {
  id: string;
  sub_library: string | null;
  neighborhood: string | null;
  primary_role: string | null;
  final_score: number | null;
};

export type PlacesShelf<T extends PlaceShelfCandidate> = {
  featured: T[];
  reserve: T[];
};

export function selectPlacesShelf<T extends PlaceShelfCandidate>(
  candidates: T[],
  opts: { limit?: number; maxPerSubLibrary?: number; maxPerNeighborhood?: number; maxPerRole?: number } = {},
): PlacesShelf<T> {
  const limit = opts.limit ?? 7;
  const maxPerSubLibrary = opts.maxPerSubLibrary ?? 3;
  const maxPerNeighborhood = opts.maxPerNeighborhood ?? 2;
  const maxPerRole = opts.maxPerRole ?? 2;

  const ranked = [...candidates].sort((a, b) => (b.final_score ?? 0) - (a.final_score ?? 0));

  const featured: T[] = [];
  const reserve: T[] = [];
  const subCount = new Map<string, number>();
  const nbCount = new Map<string, number>();
  const roleCount = new Map<string, number>();

  for (const c of ranked) {
    if (featured.length >= limit) {
      reserve.push(c);
      continue;
    }
    const sub = c.sub_library ?? "unknown";
    const nb = (c.neighborhood ?? "").toLowerCase().trim();
    const role = c.primary_role ?? "unknown";
    if ((subCount.get(sub) ?? 0) >= maxPerSubLibrary) {
      reserve.push(c);
      continue;
    }
    if (nb && (nbCount.get(nb) ?? 0) >= maxPerNeighborhood) {
      reserve.push(c);
      continue;
    }
    if ((roleCount.get(role) ?? 0) >= maxPerRole) {
      reserve.push(c);
      continue;
    }
    featured.push(c);
    subCount.set(sub, (subCount.get(sub) ?? 0) + 1);
    if (nb) nbCount.set(nb, (nbCount.get(nb) ?? 0) + 1);
    roleCount.set(role, (roleCount.get(role) ?? 0) + 1);
  }
  return { featured, reserve };
}
