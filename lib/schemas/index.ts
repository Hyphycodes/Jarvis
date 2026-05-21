import { z } from "zod";

// ---------------------------------------------------------------------------
// Enums (mirror SQL check constraints)
// ---------------------------------------------------------------------------
export const appRoleEnum = z.enum(["owner", "viewer"]);
export const memoryKindEnum = z.enum([
  "identity",
  "preference",
  "pattern",
  "principle",
  "context",
]);
export const memoryStatusEnum = z.enum(["active", "archived", "fading"]);
export const signalDirectionEnum = z.enum(["positive", "negative"]);
export const sessionKindEnum = z.enum(["mood", "interest", "plan", "energy"]);
export const decisionUserActionEnum = z.enum([
  "saved",
  "rejected",
  "refined",
  "felt_right",
  "not_my_taste",
]);

// Common helpers
const trimmed = z.string().trim();
const nonEmpty = trimmed.min(1, "Required");
const tagList = z.array(trimmed.min(1)).default([]);
const optionalText = trimmed.optional().nullable();

// ---------------------------------------------------------------------------
// profiles
// ---------------------------------------------------------------------------
export const updateProfileSchema = z
  .object({
    display_name: optionalText,
    home_city: optionalText,
    timezone: optionalText,
  })
  .strict();
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

// ---------------------------------------------------------------------------
// founder_profile
// ---------------------------------------------------------------------------
export const updateFounderProfileSchema = z
  .object({
    faith_values: optionalText,
    life_direction: optionalText,
    current_focus: optionalText,
    values: tagList.optional(),
    pinned_principles: tagList.optional(),
    vibe_keywords: tagList.optional(),
    avoid_keywords: tagList.optional(),
    dealbreakers: tagList.optional(),
    luxury_style: optionalText,
    energy_preference: optionalText,
    social_preference: optionalText,
    budget_posture: optionalText,
    food_preferences: tagList.optional(),
    music_preferences: tagList.optional(),
    venue_preferences: tagList.optional(),
    style_preferences: tagList.optional(),
    travel_preferences: tagList.optional(),
    active_projects: tagList.optional(),
    financial_goals: tagList.optional(),
    creative_goals: tagList.optional(),
    health_goals: tagList.optional(),
    travel_goals: tagList.optional(),
    cultural_growth_edges: tagList.optional(),
  })
  .strict();
export type UpdateFounderProfileInput = z.infer<
  typeof updateFounderProfileSchema
>;

// ---------------------------------------------------------------------------
// memory_items
// ---------------------------------------------------------------------------
export const createMemoryItemSchema = z
  .object({
    content: nonEmpty.max(2000),
    kind: memoryKindEnum,
    confidence: z.number().min(0).max(1).default(0.5),
    is_pinned: z.boolean().default(false),
    source: trimmed.optional(),
  })
  .strict();
export type CreateMemoryItemInput = z.infer<typeof createMemoryItemSchema>;

export const updateMemoryItemSchema = z
  .object({
    id: z.string().uuid(),
    content: nonEmpty.max(2000).optional(),
    kind: memoryKindEnum.optional(),
    status: memoryStatusEnum.optional(),
    confidence: z.number().min(0).max(1).optional(),
    is_pinned: z.boolean().optional(),
  })
  .strict();
export type UpdateMemoryItemInput = z.infer<typeof updateMemoryItemSchema>;

export const idOnlySchema = z.object({ id: z.string().uuid() }).strict();
export const pinMemoryItemSchema = z
  .object({ id: z.string().uuid(), pinned: z.boolean() })
  .strict();

// ---------------------------------------------------------------------------
// taste_signals
// ---------------------------------------------------------------------------
export const createTasteSignalSchema = z
  .object({
    trait: nonEmpty.max(160),
    direction: signalDirectionEnum,
    category: trimmed.optional(),
    weight: z.number().min(0).default(1.0),
    confidence: z.number().min(0).max(1).default(0.5),
    source: trimmed.optional(),
  })
  .strict();
export type CreateTasteSignalInput = z.infer<typeof createTasteSignalSchema>;

export const updateTasteSignalSchema = z
  .object({
    id: z.string().uuid(),
    trait: nonEmpty.max(160).optional(),
    direction: signalDirectionEnum.optional(),
    category: trimmed.optional().nullable(),
    weight: z.number().min(0).optional(),
    confidence: z.number().min(0).max(1).optional(),
  })
  .strict();
export type UpdateTasteSignalInput = z.infer<typeof updateTasteSignalSchema>;

export const adjustSignalWeightSchema = z
  .object({
    id: z.string().uuid(),
    delta: z.number().min(-10).max(10),
  })
  .strict();
export type AdjustSignalWeightInput = z.infer<typeof adjustSignalWeightSchema>;

// ---------------------------------------------------------------------------
// session_context
// ---------------------------------------------------------------------------
export const createSessionContextSchema = z
  .object({
    content: nonEmpty.max(500),
    kind: sessionKindEnum,
    expires_in_days: z.number().int().min(1).max(60).default(14),
  })
  .strict();
export type CreateSessionContextInput = z.infer<
  typeof createSessionContextSchema
>;

// ---------------------------------------------------------------------------
// auth
// ---------------------------------------------------------------------------
export const magicLinkSchema = z
  .object({
    email: z.string().email(),
  })
  .strict();
export type MagicLinkInput = z.infer<typeof magicLinkSchema>;
