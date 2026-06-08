// Private Layer — declared OPERATING preferences (how Jarvis should move).
// Pure + deterministic so storage, context, and consumers share one shape and
// the prompt/North blocks are unit-testable. Identity + durable taste stay in
// founder_profile; this is the operating-controls layer (mode + spend + rhythm
// preferences). The structured commute schedule stays in
// founder_profile.weekly_rhythm — see [[jarvis-data-architecture]].

export type OperatingMode =
  | "balanced"
  | "building"
  | "saving"
  | "social"
  | "recovery"
  | "travel"
  | "deep_work";

export type SpendMode = "saving" | "balanced" | "lifestyle" | "growth" | "invest";

/** Matches the Product Researcher BudgetTier vocab (underscored for storage). */
export type FindsComfort = "attainable" | "premium_realistic" | "aspirational";

export type AspirationalFrequency =
  | "rare_unless_requested"
  | "occasional"
  | "open_when_requested";

export type LowMediumHigh = "low" | "medium" | "high";

export type OperatingPreferences = {
  operatingMode: OperatingMode;
  annualIncomeRange: string | null;
  spendMode: SpendMode;
  savingsPriority: LowMediumHigh;
  fixedExpensePressure: LowMediumHigh;
  diningNormalMin: number | null;
  diningNormalMax: number | null;
  diningPremiumMin: number | null;
  diningPremiumMax: number | null;
  findsComfort: FindsComfort;
  premiumThreshold: number;
  aspirationalFrequency: AspirationalFrequency;
  preferredPlanWindows: string[];
  sundayReset: boolean;
  lowFrictionWeeknights: boolean;
  recoveryPreference: string | null;
  socialWindow: string | null;
  deepWorkWindow: string | null;
  rhythmNotes: string | null;
};

/** Operating modes with the short meaning the UI shows under each. */
export const OPERATING_MODES: ReadonlyArray<{
  key: OperatingMode;
  label: string;
  meaning: string;
}> = [
  { key: "balanced", label: "Balanced", meaning: "Keep quality high without pushing too hard." },
  { key: "building", label: "Building", meaning: "Favor output, discipline, and productive moves." },
  { key: "saving", label: "Saving", meaning: "Protect money — lower spend, more free moves." },
  { key: "social", label: "Social", meaning: "Prioritize people, dinners, and plans with relational upside." },
  { key: "recovery", label: "Recovery", meaning: "Lower friction — rest, health, and reset." },
  { key: "travel", label: "Travel", meaning: "Trip-aware — logistics, places, and culture rise." },
  { key: "deep_work", label: "Deep Work", meaning: "Protect focus — fewer interruptions." },
];

export const SPEND_MODES: ReadonlyArray<{ key: SpendMode; label: string }> = [
  { key: "saving", label: "Save more" },
  { key: "balanced", label: "Balanced" },
  { key: "lifestyle", label: "Lifestyle" },
  { key: "growth", label: "Growth" },
  { key: "invest", label: "Invest" },
];

export const FINDS_COMFORTS: ReadonlyArray<{ key: FindsComfort; label: string }> = [
  { key: "attainable", label: "Attainable" },
  { key: "premium_realistic", label: "Premium-realistic" },
  { key: "aspirational", label: "Aspirational" },
];

/** Jerry's stated baseline (spec): ~$100k, balanced, premium-realistic, aspirational rare. */
export const DEFAULT_OPERATING_PREFERENCES: OperatingPreferences = {
  operatingMode: "balanced",
  annualIncomeRange: "around_100k",
  spendMode: "balanced",
  savingsPriority: "medium",
  fixedExpensePressure: "medium",
  diningNormalMin: 30,
  diningNormalMax: 75,
  diningPremiumMin: 100,
  diningPremiumMax: 200,
  findsComfort: "premium_realistic",
  premiumThreshold: 300,
  aspirationalFrequency: "rare_unless_requested",
  preferredPlanWindows: ["weekday_evening", "weekend"],
  sundayReset: true,
  lowFrictionWeeknights: true,
  recoveryPreference: null,
  socialWindow: null,
  deepWorkWindow: null,
  rhythmNotes: null,
};

const MODE_KEYS = new Set<OperatingMode>(OPERATING_MODES.map((m) => m.key));
const SPEND_KEYS = new Set<SpendMode>(SPEND_MODES.map((m) => m.key));
const COMFORT_KEYS = new Set<FindsComfort>(FINDS_COMFORTS.map((m) => m.key));
const FREQ_KEYS = new Set<AspirationalFrequency>([
  "rare_unless_requested",
  "occasional",
  "open_when_requested",
]);
const LMH_KEYS = new Set<LowMediumHigh>(["low", "medium", "high"]);

/**
 * Normalize a raw DB row (snake_case) OR a partial camelCase object into the
 * canonical shape, clamping enums to valid values and falling back to defaults.
 * Reads snake_case first (DB) then camelCase (in-app), so a DB row maps directly.
 */
export function normalizeOperatingPreferences(value: unknown): OperatingPreferences {
  if (!isRecord(value)) return { ...DEFAULT_OPERATING_PREFERENCES };
  const d = DEFAULT_OPERATING_PREFERENCES;
  const pick = (snake: string, camel: string): unknown =>
    value[snake] !== undefined ? value[snake] : value[camel];
  return {
    operatingMode: enumOr(pick("operating_mode", "operatingMode"), MODE_KEYS, d.operatingMode),
    annualIncomeRange: strOrNull(pick("annual_income_range", "annualIncomeRange"), d.annualIncomeRange),
    spendMode: enumOr(pick("spend_mode", "spendMode"), SPEND_KEYS, d.spendMode),
    savingsPriority: enumOr(pick("savings_priority", "savingsPriority"), LMH_KEYS, d.savingsPriority),
    fixedExpensePressure: enumOr(pick("fixed_expense_pressure", "fixedExpensePressure"), LMH_KEYS, d.fixedExpensePressure),
    diningNormalMin: intOrNull(pick("dining_normal_min", "diningNormalMin"), d.diningNormalMin),
    diningNormalMax: intOrNull(pick("dining_normal_max", "diningNormalMax"), d.diningNormalMax),
    diningPremiumMin: intOrNull(pick("dining_premium_min", "diningPremiumMin"), d.diningPremiumMin),
    diningPremiumMax: intOrNull(pick("dining_premium_max", "diningPremiumMax"), d.diningPremiumMax),
    findsComfort: enumOr(pick("finds_comfort", "findsComfort"), COMFORT_KEYS, d.findsComfort),
    premiumThreshold: intOr(pick("premium_threshold", "premiumThreshold"), d.premiumThreshold),
    aspirationalFrequency: enumOr(pick("aspirational_frequency", "aspirationalFrequency"), FREQ_KEYS, d.aspirationalFrequency),
    preferredPlanWindows: strArray(pick("preferred_plan_windows", "preferredPlanWindows"), d.preferredPlanWindows),
    sundayReset: boolOr(pick("sunday_reset", "sundayReset"), d.sundayReset),
    lowFrictionWeeknights: boolOr(pick("low_friction_weeknights", "lowFrictionWeeknights"), d.lowFrictionWeeknights),
    recoveryPreference: strOrNull(pick("recovery_preference", "recoveryPreference"), d.recoveryPreference),
    socialWindow: strOrNull(pick("social_window", "socialWindow"), d.socialWindow),
    deepWorkWindow: strOrNull(pick("deep_work_window", "deepWorkWindow"), d.deepWorkWindow),
    rhythmNotes: strOrNull(pick("rhythm_notes", "rhythmNotes"), d.rhythmNotes),
  };
}

export function modeMeaning(mode: OperatingMode): string {
  return OPERATING_MODES.find((m) => m.key === mode)?.meaning ?? "";
}

export function modeLabel(mode: OperatingMode): string {
  return OPERATING_MODES.find((m) => m.key === mode)?.label ?? mode;
}

/** "around_100k" → "around $100k". Passes through anything already readable. */
export function formatIncomeRange(raw: string | null): string | null {
  if (!raw) return null;
  const m = /^around_(\d+)k$/i.exec(raw.trim());
  if (m) return `around $${m[1]}k`;
  return raw.replace(/_/g, " ");
}

const SPEND_POSTURE_LINE: Record<SpendMode, string> = {
  saving: "protective — favor value and free/low-cost options",
  balanced: "quality over cheapness, but avoid fantasy luxury unless asked",
  lifestyle: "comfortable premium spend on things that earn their keep",
  growth: "willing to invest in tools/experiences that compound",
  invest: "spend is directed at durable, appreciating, or high-leverage things",
};

/**
 * The "OWNER MONEY CONTEXT" block for the Product Researcher prompt, built from
 * declared spend preferences (replaces the old hardcode). Mode-aware: SAVING
 * mode tightens it; LIFESTYLE/GROWTH loosen it slightly.
 */
export function spendContextForResearcher(p: OperatingPreferences): string {
  const income = formatIncomeRange(p.annualIncomeRange);
  const lines: string[] = ["OWNER MONEY CONTEXT:"];
  lines.push(
    `- Income: ${income ?? "undisclosed"}. Spend posture: ${p.spendMode} — ${SPEND_POSTURE_LINE[p.spendMode]}.`,
  );
  lines.push(
    `- Everyday product comfort: ${comfortLabel(p.findsComfort)}. Above $${p.premiumThreshold}, justify harder (premium-realistic or hold), and pair with realistic alternatives.`,
  );
  lines.push(`- Aspirational luxury: ${frequencyLabel(p.aspirationalFrequency)}. Do not treat fantasy-luxury (e.g. $10k+ watches/apparel) as normal background Finds.`);
  if (p.diningNormalMin != null && p.diningNormalMax != null) {
    const prem =
      p.diningPremiumMin != null && p.diningPremiumMax != null
        ? `; premium dining $${p.diningPremiumMin}-${p.diningPremiumMax} when worth it`
        : "";
    lines.push(`- Normal dining $${p.diningNormalMin}-${p.diningNormalMax}${prem}.`);
  }
  if (p.operatingMode === "saving") {
    lines.push("- ACTIVE MODE: Saving — suppress expensive picks; only surface high-conviction value.");
  }
  return lines.join("\n");
}

/**
 * Fit-relevant operating read for the council/agents — how hard to push, spend
 * posture, and rhythm guardrails. A few short lines so judging brains weigh
 * effort/spend/timing the way the owner declared.
 */
export function operatingFitBlock(p: OperatingPreferences): string {
  const lines: string[] = [];
  lines.push(`Operating mode: ${modeLabel(p.operatingMode)} — ${modeMeaning(p.operatingMode)}`);
  lines.push(
    `Spend posture: ${p.spendMode} (${comfortLabel(p.findsComfort)}; aspirational ${frequencyShort(p.aspirationalFrequency)}).`,
  );
  const rhythm: string[] = [];
  if (p.sundayReset) rhythm.push("Sundays are a reset day");
  if (p.lowFrictionWeeknights) rhythm.push("weeknights should stay low-friction");
  if (p.preferredPlanWindows.length) rhythm.push(`prefers plans in ${p.preferredPlanWindows.join("/")}`);
  if (rhythm.length) lines.push(`Rhythm: ${rhythm.join("; ")}.`);
  return lines.join("\n");
}

/** One-line operating read for North (mode + spend posture). */
export function operatingSummaryLine(p: OperatingPreferences): string {
  const income = formatIncomeRange(p.annualIncomeRange);
  const spendBits = [
    `spend ${p.spendMode}`,
    comfortLabel(p.findsComfort).toLowerCase(),
    `aspirational ${frequencyShort(p.aspirationalFrequency)}`,
  ];
  return `Operating in ${modeLabel(p.operatingMode)} mode · ${spendBits.join(", ")}${income ? ` · ${income}` : ""}.`;
}

export function comfortLabel(c: FindsComfort): string {
  return c === "premium_realistic" ? "premium-realistic" : c;
}

function frequencyLabel(f: AspirationalFrequency): string {
  switch (f) {
    case "rare_unless_requested":
      return "rare unless explicitly requested";
    case "occasional":
      return "occasional";
    case "open_when_requested":
      return "open when requested";
  }
}

function frequencyShort(f: AspirationalFrequency): string {
  switch (f) {
    case "rare_unless_requested":
      return "rare";
    case "occasional":
      return "occasional";
    case "open_when_requested":
      return "on request";
  }
}

// ── tiny guards ──────────────────────────────────────────────────────────────
function enumOr<T extends string>(value: unknown, set: Set<T>, fallback: T): T {
  return typeof value === "string" && set.has(value as T) ? (value as T) : fallback;
}
function strOrNull(value: unknown, fallback: string | null): string | null {
  if (value === null) return null;
  if (typeof value === "string") return value.trim() ? value.trim() : null;
  return fallback;
}
function intOr(value: unknown, fallback: number): number {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? Math.round(n) : fallback;
}
function intOrNull(value: unknown, fallback: number | null): number | null {
  if (value === null) return null;
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? Math.round(n) : fallback;
}
function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}
function strArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const out = value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  return out;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
