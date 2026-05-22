import "server-only";

import { getServerSupabase } from "@/lib/supabase/ssr-server";
import {
  AMBIENT_RUN_POLICIES,
  type AmbientRunType,
} from "@/lib/intelligence/runTypes";

export type IntelligenceBudget = {
  dailyBudgetUsd: number;
  estimatedSpentTodayUsd: number;
  budgetRemainingUsd: number;
  estimatedRunCostUsd: number;
  testMode: boolean;
  caps: {
    maxDailyRuns: number;
    maxClaudeCalls: number;
    maxSourceCalls: number;
    maxCandidates: number;
    maxBriefings: number;
  };
  usage: {
    claudeCalls: number;
    sourceCalls: number;
    candidates: number;
    briefings: number;
  };
  skipped: string[];
};

const DEFAULT_DAILY_BUDGET_USD = 5;
const DEFAULT_MAX_DAILY_RUNS = 6;
const CLAUDE_CALL_ESTIMATE_USD = 0.035;
const SOURCE_CALL_ESTIMATE_USD = 0.015;
const CANDIDATE_ESTIMATE_USD = 0.001;

export async function createIntelligenceBudget(input: {
  userId: string;
  runType: AmbientRunType;
  testMode?: boolean;
}): Promise<IntelligenceBudget> {
  const policy = AMBIENT_RUN_POLICIES[input.runType];
  const dailyBudgetUsd = envNumber(
    "DAILY_INTELLIGENCE_BUDGET_USD",
    DEFAULT_DAILY_BUDGET_USD,
  );
  const testMode =
    input.testMode === true ||
    /^true$/i.test(process.env.INTELLIGENCE_TEST_MODE ?? "");
  const estimatedSpentTodayUsd = await readEstimatedSpentToday(input.userId);
  const maxDailyRuns = envNumber("MAX_DAILY_INTELLIGENCE_RUNS", DEFAULT_MAX_DAILY_RUNS);
  return {
    dailyBudgetUsd,
    estimatedSpentTodayUsd,
    budgetRemainingUsd: Math.max(0, dailyBudgetUsd - estimatedSpentTodayUsd),
    estimatedRunCostUsd: 0,
    testMode,
    caps: {
      maxDailyRuns,
      maxClaudeCalls: envNumber("MAX_CLAUDE_CALLS_PER_RUN", policy.maxClaudeCalls),
      maxSourceCalls: envNumber("MAX_SOURCE_CALLS_PER_RUN", policy.maxSourceCalls),
      maxCandidates: envNumber("MAX_CANDIDATES_PER_RUN", policy.maxCandidates),
      maxBriefings: envNumber("MAX_BRIEFINGS_PER_RUN", policy.maxBriefings),
    },
    usage: {
      claudeCalls: 0,
      sourceCalls: 0,
      candidates: 0,
      briefings: 0,
    },
    skipped: [],
  };
}

export function recordBudgetUsage(
  budget: IntelligenceBudget,
  usage: Partial<IntelligenceBudget["usage"]>,
): IntelligenceBudget {
  const next: IntelligenceBudget = {
    ...budget,
    usage: {
      claudeCalls: budget.usage.claudeCalls + (usage.claudeCalls ?? 0),
      sourceCalls: budget.usage.sourceCalls + (usage.sourceCalls ?? 0),
      candidates: budget.usage.candidates + (usage.candidates ?? 0),
      briefings: budget.usage.briefings + (usage.briefings ?? 0),
    },
  };
  next.estimatedRunCostUsd = estimateUsageCost(next.usage);
  next.budgetRemainingUsd = Math.max(
    0,
    next.dailyBudgetUsd - next.estimatedSpentTodayUsd - next.estimatedRunCostUsd,
  );
  return next;
}

export function shouldSkipForBudget(
  budget: IntelligenceBudget,
  kind: "claude" | "source" | "candidate" | "briefing",
): boolean {
  if (budget.testMode) return false;
  if (budget.estimatedRunCostUsd >= budget.budgetRemainingUsd && budget.budgetRemainingUsd <= 0) {
    return true;
  }
  switch (kind) {
    case "claude":
      return budget.usage.claudeCalls >= budget.caps.maxClaudeCalls;
    case "source":
      return budget.usage.sourceCalls >= budget.caps.maxSourceCalls;
    case "candidate":
      return budget.usage.candidates >= budget.caps.maxCandidates;
    case "briefing":
      return budget.usage.briefings >= budget.caps.maxBriefings;
  }
}

export function budgetForLog(budget: IntelligenceBudget): Record<string, unknown> {
  return {
    daily_budget_usd: budget.dailyBudgetUsd,
    estimated_spent_today_usd: roundCost(budget.estimatedSpentTodayUsd),
    estimated_run_cost_usd: roundCost(budget.estimatedRunCostUsd),
    budget_remaining_usd: roundCost(budget.budgetRemainingUsd),
    test_mode: budget.testMode,
    caps: budget.caps,
    usage: budget.usage,
    skipped: budget.skipped,
  };
}

async function readEstimatedSpentToday(userId: string): Promise<number> {
  try {
    const supabase = await getServerSupabase();
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const { data, error } = await supabase
      .from("brain_decision_runs")
      .select("raw_output")
      .eq("user_id", userId)
      .gte("created_at", since.toISOString());
    if (error || !data) return 0;
    return data.reduce((sum, row: { raw_output: unknown }) => {
      const raw = isRecord(row.raw_output) ? row.raw_output : {};
      const budget = isRecord(raw.budget) ? raw.budget : {};
      const cost = budget.estimated_run_cost_usd;
      return sum + (typeof cost === "number" ? cost : 0);
    }, 0);
  } catch {
    return 0;
  }
}

function estimateUsageCost(usage: IntelligenceBudget["usage"]): number {
  return roundCost(
    usage.claudeCalls * CLAUDE_CALL_ESTIMATE_USD +
      usage.sourceCalls * SOURCE_CALL_ESTIMATE_USD +
      usage.candidates * CANDIDATE_ESTIMATE_USD,
  );
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundCost(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
