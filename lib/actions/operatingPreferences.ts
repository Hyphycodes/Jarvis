"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOwner } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { recordSettingsSignal } from "@/lib/memory/settingsSignals";
import {
  DEFAULT_OPERATING_PREFERENCES,
  normalizeOperatingPreferences,
  type OperatingMode,
  type OperatingPreferences,
} from "@/lib/operating/operatingPreferences";
import type { Json } from "@/lib/types/database";

const modeEnum = z.enum([
  "balanced",
  "building",
  "saving",
  "social",
  "recovery",
  "travel",
  "deep_work",
]);

const spendSchema = z
  .object({
    annualIncomeRange: z.string().trim().max(40).nullable().optional(),
    spendMode: z.enum(["saving", "balanced", "lifestyle", "growth", "invest"]).optional(),
    savingsPriority: z.enum(["low", "medium", "high"]).nullable().optional(),
    fixedExpensePressure: z.enum(["low", "medium", "high"]).nullable().optional(),
    diningNormalMin: z.number().int().min(0).max(100000).nullable().optional(),
    diningNormalMax: z.number().int().min(0).max(100000).nullable().optional(),
    diningPremiumMin: z.number().int().min(0).max(100000).nullable().optional(),
    diningPremiumMax: z.number().int().min(0).max(100000).nullable().optional(),
    findsComfort: z.enum(["attainable", "premium_realistic", "aspirational"]).optional(),
    premiumThreshold: z.number().int().min(0).max(1000000).optional(),
    aspirationalFrequency: z
      .enum(["rare_unless_requested", "occasional", "open_when_requested"])
      .optional(),
  })
  .strict();
export type UpdateSpendInput = z.infer<typeof spendSchema>;

const rhythmSchema = z
  .object({
    preferredPlanWindows: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
    sundayReset: z.boolean().optional(),
    lowFrictionWeeknights: z.boolean().optional(),
    recoveryPreference: z.string().trim().max(120).nullable().optional(),
    socialWindow: z.string().trim().max(120).nullable().optional(),
    deepWorkWindow: z.string().trim().max(120).nullable().optional(),
    rhythmNotes: z.string().trim().max(600).nullable().optional(),
  })
  .strict();
export type UpdateRhythmPreferencesInput = z.infer<typeof rhythmSchema>;

/** camelCase patch key → DB column. */
const COLUMN_MAP: Record<string, string> = {
  annualIncomeRange: "annual_income_range",
  spendMode: "spend_mode",
  savingsPriority: "savings_priority",
  fixedExpensePressure: "fixed_expense_pressure",
  diningNormalMin: "dining_normal_min",
  diningNormalMax: "dining_normal_max",
  diningPremiumMin: "dining_premium_min",
  diningPremiumMax: "dining_premium_max",
  findsComfort: "finds_comfort",
  premiumThreshold: "premium_threshold",
  aspirationalFrequency: "aspirational_frequency",
  preferredPlanWindows: "preferred_plan_windows",
  sundayReset: "sunday_reset",
  lowFrictionWeeknights: "low_friction_weeknights",
  recoveryPreference: "recovery_preference",
  socialWindow: "social_window",
  deepWorkWindow: "deep_work_window",
  rhythmNotes: "rhythm_notes",
};

function toDbPatch(patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const col = COLUMN_MAP[key];
    if (col) out[col] = value;
  }
  return out;
}

/** Read the owner's operating preferences, or sensible defaults if unset. */
export async function getOperatingPreferences(): Promise<OperatingPreferences> {
  const owner = await requireOwner();
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("user_operating_preferences")
    .select("*")
    .eq("user_id", owner.id)
    .maybeSingle();
  if (error && !/relation|does not exist|schema cache/i.test(error.message)) {
    console.warn("[operating.get]", error.message);
  }
  return data ? normalizeOperatingPreferences(data) : { ...DEFAULT_OPERATING_PREFERENCES };
}

async function upsertOperating(
  userId: string,
  supabase: Awaited<ReturnType<typeof getServerSupabase>>,
  dbPatch: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from("user_operating_preferences")
    .upsert({ user_id: userId, ...dbPatch }, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
}

/** Operating Mode — the main "how should Jarvis move?" control. */
export async function setOperatingMode(
  mode: OperatingMode,
): Promise<{ ok: true; mode: OperatingMode }> {
  const owner = await requireOwner();
  const supabase = await getServerSupabase();
  const parsed = modeEnum.parse(mode);

  await upsertOperating(owner.id, supabase, { operating_mode: parsed });

  await recordSettingsSignal(supabase, owner.id, {
    event: "settings.mode.changed",
    domain: "rhythm",
    source: "settings.mode",
    trait: `${parsed}_mode`,
    payload: { operating_mode: parsed },
  });

  revalidatePath("/account");
  revalidatePath("/");
  revalidatePath("/north");
  return { ok: true, mode: parsed };
}

/** Spend comfort — posture, not a budget tracker. */
export async function updateSpend(input: UpdateSpendInput): Promise<{ ok: true }> {
  const owner = await requireOwner();
  const supabase = await getServerSupabase();
  const patch = spendSchema.parse(input);
  const dbPatch = toDbPatch(patch as Record<string, unknown>);
  if (Object.keys(dbPatch).length === 0) return { ok: true };

  await upsertOperating(owner.id, supabase, dbPatch);

  await recordSettingsSignal(supabase, owner.id, {
    event: "settings.spend.updated",
    domain: "money",
    source: "settings.spend",
    trait: spendTrait(patch),
    payload: dbPatch,
  });

  revalidatePath("/account");
  revalidatePath("/");
  revalidatePath("/north");
  return { ok: true };
}

/** Rhythm preferences (commute schedule stays in founder_profile.weekly_rhythm). */
export async function updateRhythmPreferences(
  input: UpdateRhythmPreferencesInput,
): Promise<{ ok: true }> {
  const owner = await requireOwner();
  const supabase = await getServerSupabase();
  const patch = rhythmSchema.parse(input);
  const dbPatch = toDbPatch(patch as Record<string, unknown>);
  if (patch.preferredPlanWindows !== undefined) {
    dbPatch.preferred_plan_windows = patch.preferredPlanWindows as unknown as Json;
  }
  if (Object.keys(dbPatch).length === 0) return { ok: true };

  await upsertOperating(owner.id, supabase, dbPatch);

  await recordSettingsSignal(supabase, owner.id, {
    event: "settings.rhythm.updated",
    domain: "rhythm",
    source: "settings.rhythm",
    payload: dbPatch,
  });

  revalidatePath("/account");
  revalidatePath("/");
  return { ok: true };
}

function spendTrait(patch: UpdateSpendInput): string {
  const bits: string[] = [];
  if (patch.spendMode) bits.push(`${patch.spendMode}_spend`);
  if (patch.findsComfort) bits.push(patch.findsComfort);
  if (patch.aspirationalFrequency) bits.push(`aspirational_${patch.aspirationalFrequency}`);
  return bits.join("__") || "spend_updated";
}
