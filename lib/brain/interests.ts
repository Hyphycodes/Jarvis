/**
 * Interest Graph — Jarvis's model of the founder's world.
 *
 * Not stored in a dedicated table. Stable patterns live in `memory_items`;
 * runtime graph snapshots live in `brain_decision_runs.raw_output`. The
 * seed (see `interestSeed.ts`) is the starting point — behavior and memory
 * proposals shift weights and status over time.
 *
 * The Interest Graph powers the Taste Strategist: when Jarvis decides what
 * to be curious about, it reads this model, not a hardcoded category list.
 */

export type InterestStatus =
  | "active"
  | "dormant"
  | "emerging"
  | "avoid"
  | "seasonal";

export type SpendingPosture = "free" | "low" | "paid" | "high";

export type EffortLevel = "low" | "medium" | "high";

export type InterestSeason =
  | "year_round"
  | "spring"
  | "summer"
  | "fall"
  | "winter"
  | "holidays";

export type PreferredDestination =
  | "radar"
  | "holding"
  | "discovered"
  | "north";

export type InterestBelief =
  | "seed_profile"
  | "memory"
  | "behavior"
  | "manual"
  | "inferred";

/**
 * A single interest node. Top-level areas reference subinterests by id;
 * subinterests reference their parent via `parentId`.
 */
export type Interest = {
  id: string;
  label: string;
  parentId?: string;
  status: InterestStatus;
  /** 0..1 — overall strength of this interest in the user's life right now. */
  weight: number;
  /** 0..1 — confidence in the belief that this interest is real. */
  confidence: number;
  /** Child interest ids. Empty for leaves. */
  subinterests: string[];
  /** Sibling/adjacent interest ids (for "stretch" suggestions). */
  adjacent: string[];
  /** Which source lanes typically yield material for this interest. */
  relatedSources: Array<
    | "localRadar"
    | "googlePlaces"
    | "ticketmaster"
    | "tavily"
    | "brave"
    | "serpapi"
    | "mlb"
  >;
  /** Where items from this interest tend to land by default. */
  preferredDestinations: PreferredDestination[];
  spendingPosture: SpendingPosture;
  effortLevel: EffortLevel;
  seasonality?: InterestSeason;
  examples: string[];
  avoidNotes: string[];
  lastExploredAt?: string;
  explorationCount: number;
  belief: InterestBelief;
};

/**
 * A built Interest Graph. `byId` is the index of all nodes; `topLevel` is
 * the list of root area ids.
 */
export type InterestGraph = {
  byId: Record<string, Interest>;
  topLevel: string[];
  /** When this snapshot was built. */
  builtAt: string;
  /** Source mix that produced the graph. */
  origin: {
    seedCount: number;
    memoryInferred: number;
    behaviorAdjusted: number;
  };
};

// ── Selectors ────────────────────────────────────────────────────────────────

export function getInterest(
  graph: InterestGraph,
  id: string,
): Interest | undefined {
  return graph.byId[id];
}

export function listInterests(graph: InterestGraph): Interest[] {
  return Object.values(graph.byId);
}

export function listTopLevelInterests(graph: InterestGraph): Interest[] {
  return graph.topLevel
    .map((id) => graph.byId[id])
    .filter((x): x is Interest => Boolean(x));
}

export function listSubinterests(
  graph: InterestGraph,
  parentId: string,
): Interest[] {
  const parent = graph.byId[parentId];
  if (!parent) return [];
  return parent.subinterests
    .map((id) => graph.byId[id])
    .filter((x): x is Interest => Boolean(x));
}

export function listActiveInterests(graph: InterestGraph): Interest[] {
  return listInterests(graph).filter(
    (i) => i.status === "active" || i.status === "emerging",
  );
}

export function listDormantInterests(graph: InterestGraph): Interest[] {
  return listInterests(graph).filter((i) => i.status === "dormant");
}

export function listAvoidInterests(graph: InterestGraph): Interest[] {
  return listInterests(graph).filter((i) => i.status === "avoid");
}

/**
 * Compact summary used to fit the graph into a Claude prompt. Keeps top-level
 * areas + their highest-weight subinterests, drops scaffolding.
 */
export function summarizeInterestGraph(
  graph: InterestGraph,
  options: { maxSubinterestsPerArea?: number } = {},
): {
  top_level: Array<{
    id: string;
    label: string;
    status: InterestStatus;
    weight: number;
    posture: SpendingPosture;
    effort: EffortLevel;
    subinterests: Array<{ id: string; label: string; weight: number; status: InterestStatus }>;
    adjacent: string[];
    avoid_notes: string[];
  }>;
  origin: InterestGraph["origin"];
} {
  const maxSubs = options.maxSubinterestsPerArea ?? 6;
  return {
    top_level: listTopLevelInterests(graph)
      .filter((i) => i.status !== "avoid")
      .map((area) => ({
        id: area.id,
        label: area.label,
        status: area.status,
        weight: roundTo(area.weight, 2),
        posture: area.spendingPosture,
        effort: area.effortLevel,
        subinterests: listSubinterests(graph, area.id)
          .filter((s) => s.status !== "avoid")
          .sort((a, b) => b.weight - a.weight)
          .slice(0, maxSubs)
          .map((s) => ({
            id: s.id,
            label: s.label,
            weight: roundTo(s.weight, 2),
            status: s.status,
          })),
        adjacent: area.adjacent,
        avoid_notes: area.avoidNotes,
      })),
    origin: graph.origin,
  };
}

function roundTo(n: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}
