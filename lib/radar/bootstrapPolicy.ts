import type { RadarAutopilotHealth, RadarAutopilotOperation } from "@/lib/radar/autopilotPolicy";

export const BOOTSTRAP_TARGETS = {
  places: 100,
  activeEvents: 40,
  sources: 50,
  candidateInbox: 150,
  tierAPlusB: 25,
  recurringSignals: 20,
  tastemakers: 25,
  organizations: 20,
  neighborhoods: 10,
} as const;

export const BOOTSTRAP_RUN_BUDGET = {
  maxCampaigns: 6,
  maxSourceCalls: 12,
  maxCandidatesCreated: 100,
  maxLibraryItemsCreated: 50,
  maxEventsCreated: 50,
  maxSourcesCreated: 50,
} as const;

export type BootstrapGap = keyof typeof BOOTSTRAP_TARGETS;

export type BootstrapAssessment = {
  needed: boolean;
  reason: string;
  gaps: BootstrapGap[];
  progress: Record<BootstrapGap, { current: number; target: number }>;
};

const BOOTSTRAP_TRIGGER_GAPS: BootstrapGap[] = [
  "places",
  "activeEvents",
  "sources",
  "candidateInbox",
  "tierAPlusB",
];

export function assessBootstrapNeed(health: RadarAutopilotHealth): BootstrapAssessment {
  const current = {
    places: health.library.places,
    activeEvents: health.library.events,
    sources: health.sourceCount,
    candidateInbox: health.candidateInboxCount,
    tierAPlusB: health.library.tierA + health.library.tierB,
    recurringSignals: health.library.recurringSignals,
    tastemakers: health.library.people,
    organizations: health.library.organizations,
    neighborhoods: 0,
  } satisfies Record<BootstrapGap, number>;

  const progress = Object.fromEntries(
    (Object.keys(BOOTSTRAP_TARGETS) as BootstrapGap[]).map((key) => [
      key,
      { current: current[key], target: BOOTSTRAP_TARGETS[key] },
    ]),
  ) as BootstrapAssessment["progress"];
  const gaps = BOOTSTRAP_TRIGGER_GAPS.filter(
    (key) => progress[key].current < progress[key].target,
  );

  return {
    needed: gaps.length > 0,
    reason: gaps.length > 0
      ? `Foundation build needed: ${gaps.slice(0, 4).join(", ")}${gaps.length > 4 ? "..." : ""}.`
      : "Foundation targets are healthy.",
    gaps,
    progress,
  };
}

export function foundationOperationStack(input: {
  health: RadarAutopilotHealth;
  maxOperations?: number;
}): RadarAutopilotOperation[] {
  const operations: RadarAutopilotOperation[] = [];
  const { health } = input;
  const push = (operation: RadarAutopilotOperation) => {
    if (!operations.includes(operation)) operations.push(operation);
  };

  if (health.sourceCount < BOOTSTRAP_TARGETS.sources) push("source_building_campaign");
  if (health.library.places < BOOTSTRAP_TARGETS.places) push("library_build");
  if (health.library.events < BOOTSTRAP_TARGETS.activeEvents) push("event_pulse_build");
  if (health.candidateInboxCount < BOOTSTRAP_TARGETS.candidateInbox) push("candidate_inbox_build");
  if (health.sourcesDue > 0) push("source_recheck");
  if (health.holdingCount < 18) push("holding_build");
  push("source_expansion");

  const maxOperations = input.maxOperations ?? BOOTSTRAP_RUN_BUDGET.maxCampaigns;
  const bounded = operations.slice(0, Math.max(0, maxOperations - 1));
  if (!bounded.includes("promotion_review")) bounded.push("promotion_review");
  return bounded;
}

export function bootstrapProviderSummary(status: Record<string, string>): string | null {
  const missing = Object.entries(status)
    .filter(([, value]) => value !== "available")
    .map(([key]) => key);
  if (missing.length === 0) return null;
  const available = Object.entries(status)
    .filter(([, value]) => value === "available")
    .map(([key]) => key);
  if (available.length === 0) {
    return `No external discovery providers are configured. Configure ${missing.join(", ")}.`;
  }
  return `Bootstrap will use ${available.join(", ")}; missing providers: ${missing.join(", ")}.`;
}
