/**
 * Events category editor (per jarvis-events-engine-brain-tree.md) — assembles a
 * BALANCED shelf, not just the top scores: sub-library variety (music/food/art/
 * outdoor), no venue/source spam, urgency balance. Pure + unit-tested; the engine
 * render surfaces exactly the featured set this returns.
 */

export type ShelfCandidate = {
  id: string;
  sub_library: string | null;
  venue: string | null;
  final_score: number | null;
  urgency: string | null; // now | soon | normal | low
  starts_at: string | null;
};

export type EventsShelf<T extends ShelfCandidate> = {
  featured: T[];
  reserve: T[];
};

const URGENCY_WEIGHT: Record<string, number> = { now: 0.15, soon: 0.1, normal: 0.04, low: 0 };

export function selectEventsShelf<T extends ShelfCandidate>(
  candidates: T[],
  opts: { limit?: number; maxPerSubLibrary?: number; maxPerVenue?: number } = {},
): EventsShelf<T> {
  const limit = opts.limit ?? 7;
  const maxPerSubLibrary = opts.maxPerSubLibrary ?? 3;
  const maxPerVenue = opts.maxPerVenue ?? 1;

  // Rank by score nudged up by urgency (a strong soon-event beats a slightly
  // stronger far-off one), so the shelf leans actionable.
  const ranked = [...candidates].sort((a, b) => effScore(b) - effScore(a));

  const featured: T[] = [];
  const reserve: T[] = [];
  const subCount = new Map<string, number>();
  const venueCount = new Map<string, number>();

  for (const c of ranked) {
    if (featured.length >= limit) {
      reserve.push(c);
      continue;
    }
    const sub = c.sub_library ?? "unknown";
    const venue = (c.venue ?? "").toLowerCase().trim();
    if ((subCount.get(sub) ?? 0) >= maxPerSubLibrary) {
      reserve.push(c);
      continue;
    }
    if (venue && (venueCount.get(venue) ?? 0) >= maxPerVenue) {
      reserve.push(c);
      continue;
    }
    featured.push(c);
    subCount.set(sub, (subCount.get(sub) ?? 0) + 1);
    if (venue) venueCount.set(venue, (venueCount.get(venue) ?? 0) + 1);
  }
  return { featured, reserve };
}

function effScore(c: ShelfCandidate): number {
  const base = typeof c.final_score === "number" && Number.isFinite(c.final_score) ? c.final_score : 0;
  const bump = URGENCY_WEIGHT[c.urgency ?? "normal"] ?? 0;
  return base + bump;
}
