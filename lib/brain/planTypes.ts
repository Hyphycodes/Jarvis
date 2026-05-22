/**
 * Plan Generator types + Zod schemas.
 *
 * A Plan is a first-class object: stored in `plans`, sectioned via
 * `plan_sections`, optionally timelined via `today_timeline_items`, and
 * connected back to its source item via payload.plan_id / plan_slug /
 * plan_status.
 */

import { z } from "zod";

export const PLAN_TYPES = [
  "dining",
  "event",
  "activity",
  "culture",
  "style",
  "product",
  "travel",
  "fitness",
  "creative",
  "real_estate",
  "land",
  "outdoors",
  "idea",
  "general",
] as const;

export const PLAN_STATUSES = [
  "draft",
  "active",
  "completed",
  "cancelled",
] as const;

export const SECTION_TYPES = [
  "why",
  "timing",
  "before",
  "move",
  "route",
  "atmosphere",
  "wear",
  "bring",
  "cost",
  "detours",
  "after",
  "alternatives",
  "research",
  "notes",
] as const;

export const EFFORT_LEVELS = ["low", "medium", "high"] as const;
export const SPENDING_POSTURES = ["free", "low", "paid", "high", "unknown"] as const;

// ── Section schema ──────────────────────────────────────────────────────────

export const planSectionSchema = z.object({
  key: z.string().min(1).max(80),
  title: z.string().min(1).max(120),
  subtitle: z.string().max(180).optional(),
  body: z.string().min(1).max(1200),
  sort_order: z.number().int().min(0).default(0),
  section_type: z.enum(SECTION_TYPES),
  bullets: z.array(z.string().min(1).max(220)).max(8).optional(),
});

export type PlanSection = z.infer<typeof planSectionSchema>;

// ── Timeline entry ──────────────────────────────────────────────────────────

export const planTimelineEntrySchema = z.object({
  title: z.string().min(1).max(120),
  starts_at: z.string().datetime().optional(),
  ends_at: z.string().datetime().optional(),
  /** Human-friendly time label when ISO not available — e.g. "After dinner". */
  time_label: z.string().max(60).optional(),
  description: z.string().max(280).optional(),
  sort_order: z.number().int().min(0).default(0),
});

export type PlanTimelineEntry = z.infer<typeof planTimelineEntrySchema>;

// ── Grab list ───────────────────────────────────────────────────────────────

export const planGrabItemSchema = z.object({
  label: z.string().min(1).max(60),
  reason: z.string().max(160).optional(),
});

export type PlanGrabItem = z.infer<typeof planGrabItemSchema>;

// ── Full generated plan ─────────────────────────────────────────────────────

export const generatedPlanSchema = z.object({
  title: z.string().min(1).max(120),
  subtitle: z.string().max(180).optional(),
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase-kebab"),
  plan_type: z.enum(PLAN_TYPES),
  status: z.literal("draft"),
  starts_at: z.string().datetime().optional(),
  ends_at: z.string().datetime().optional(),
  location_name: z.string().max(160).optional(),
  address: z.string().max(240).optional(),
  hero_angle: z.string().min(1).max(220),
  why_this_fits: z.string().min(1).max(360),
  best_window: z.string().max(180).optional(),
  effort_level: z.enum(EFFORT_LEVELS),
  spending_posture: z.enum(SPENDING_POSTURES),
  confidence: z.number().min(0).max(1),
  primary_move: z.string().min(1).max(220),
  sections: z.array(planSectionSchema).min(2).max(11),
  timeline: z.array(planTimelineEntrySchema).max(8).default([]),
  grab_list: z.array(planGrabItemSchema).max(8).default([]),
  cautions: z.array(z.string().min(1).max(200)).max(4).optional(),
  source_item_id: z.string().uuid().optional(),
});

export type GeneratedPlan = z.infer<typeof generatedPlanSchema>;

// ── Generation result envelope ──────────────────────────────────────────────

export type PlanGenerationResult = {
  plan: GeneratedPlan;
  fallbackUsed: boolean;
  reason?: string;
};

// ── Helpers ─────────────────────────────────────────────────────────────────

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "plan";
}
