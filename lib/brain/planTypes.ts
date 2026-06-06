/**
 * Plan Generator types + Zod schemas.
 *
 * A Plan is a first-class object: stored in `plans`, sectioned via
 * `plan_sections`, optionally timelined via `today_timeline_items`, and
 * connected back to its source item via payload.plan_id / plan_slug /
 * plan_status.
 */

import { z } from "zod";

export const PLAN_SHAPES = [
  "experience",
  "occasion",
  "acquisition",
  "touchpoint",
] as const;

export type PlanShape = typeof PLAN_SHAPES[number];

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

const optionalString = (max: number) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((value) => value ?? undefined);

const optionalDatetime = z
  .string()
  .datetime()
  .nullish()
  .transform((value) => value ?? undefined);

// ── Section schema ──────────────────────────────────────────────────────────

export const planSectionSchema = z.object({
  key: z.string().min(1).max(80),
  title: z.string().min(1).max(120),
  subtitle: optionalString(180),
  body: z.string().min(1).max(1200),
  sort_order: z.number().int().min(0).default(0),
  section_type: z.enum(SECTION_TYPES),
  bullets: z
    .array(z.string().min(1).max(220))
    .max(8)
    .nullish()
    .transform((value) => value ?? undefined),
});

export type PlanSection = z.infer<typeof planSectionSchema>;

// ── Timeline entry ──────────────────────────────────────────────────────────

export const planTimelineEntrySchema = z.object({
  title: z.string().min(1).max(120),
  starts_at: optionalDatetime,
  ends_at: optionalDatetime,
  /** Human-friendly time label when ISO not available — e.g. "After dinner". */
  time_label: optionalString(60),
  description: optionalString(280),
  sort_order: z.number().int().min(0).default(0),
});

export type PlanTimelineEntry = z.infer<typeof planTimelineEntrySchema>;

// ── Grab list ───────────────────────────────────────────────────────────────

export const planGrabItemSchema = z.object({
  label: z.string().min(1).max(60),
  reason: optionalString(160),
});

export type PlanGrabItem = z.infer<typeof planGrabItemSchema>;

// ── Full generated plan ─────────────────────────────────────────────────────

export const generatedPlanSchema = z.object({
  title: z.string().min(1).max(120),
  subtitle: optionalString(180),
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase-kebab"),
  plan_type: z.enum(PLAN_TYPES),
  is_sequential: z.boolean().optional().default(false),
  status: z.literal("draft").optional().default("draft"),
  starts_at: optionalDatetime,
  ends_at: optionalDatetime,
  location_name: optionalString(160),
  address: optionalString(240),
  hero_angle: z.string().min(1).max(220),
  why_this_fits: z.string().min(1).max(360),
  best_window: optionalString(180),
  effort_level: z.enum(EFFORT_LEVELS).optional().default("medium"),
  spending_posture: z.enum(SPENDING_POSTURES).optional().default("unknown"),
  confidence: z.number().min(0).max(1),
  primary_move: z.string().min(1).max(220),
  sections: z.array(planSectionSchema).min(2).max(11),
  timeline: z.array(planTimelineEntrySchema).max(8).default([]),
  grab_list: z.array(planGrabItemSchema).max(8).default([]),
  menu_highlights: z
    .array(
      z.object({
        dish: z.string().min(1).max(80),
        note: optionalString(160),
      }),
    )
    .max(6)
    .nullish()
    .transform((value) => value ?? undefined),
  cautions: z
    .array(z.string().min(1).max(200))
    .max(4)
    .nullish()
    .transform((value) => value ?? undefined),
  source_item_id: z
    .string()
    .uuid()
    .nullish()
    .transform((value) => value ?? undefined),
});

export type GeneratedPlan = z.infer<typeof generatedPlanSchema>;

// ── Generation result envelope ──────────────────────────────────────────────

export type PlanGenerationResult = {
  plan: GeneratedPlan;
  fallbackUsed: boolean;
  reason?: string;
  selectedPhotoUrl?: string | null;
  reservation?: {
    reservable: boolean;
    bookingUrl: string | null;
    website: string | null;
    hoursSummary: string | null;
  } | null;
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
