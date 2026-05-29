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
  "taste",
  "avoidance",
  "decision_rule",
  "relationship",
  "north_goal",
  "place_history",
  "event_history",
  "confirmed_behavior",
]);
export const memoryStatusEnum = z.enum([
  "active",
  "pending",
  "rejected",
  "archived",
  "fading",
]);
export const signalDirectionEnum = z.enum(["positive", "negative"]);
export const sessionKindEnum = z.enum(["mood", "interest", "plan", "energy"]);
export const decisionUserActionEnum = z.enum([
  "saved",
  "rejected",
  "refined",
  "felt_right",
  "not_my_taste",
]);

export const intelligenceDestinationEnum = z.enum([
  "today.hero",
  "today.timeline",
  "today.grabList",
  "today.livePlan",
  "radar.feed",
  "radar.saved",
  "radar.passed",
  "circle.person",
  "circle.update",
  "north.goal",
  "north.pillar",
  "plan.detail",
  "memory.taste",
  "memory.relationship",
  "memory.preference",
  "notification",
]);
export const intelligenceSurfaceEnum = z.enum([
  "today",
  "radar",
  "circle",
  "north",
  "plan_detail",
]);
export const intelligenceSourceEnum = z.enum([
  "ai",
  "memory",
  "directory",
  "research",
  "manual",
  "system",
]);
export const decisionModeEnum = z.enum([
  "instant",
  "standard",
  "deep",
  "director_cut",
]);
export const memoryTypeEnum = z.enum([
  "taste",
  "avoidance",
  "decision_rule",
  "relationship",
  "north_goal",
  "place_history",
  "event_history",
  "confirmed_behavior",
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
// intelligence contracts
// ---------------------------------------------------------------------------
const unknownRecord = z.record(z.string(), z.unknown());

export const routedIntelligenceSchema = z
  .object({
    id: z.string().min(1),
    destination: intelligenceDestinationEnum,
    priority: z.number(),
    confidence: z.number().min(0).max(1),
    expiresAt: z.string().datetime().optional(),
    payload: z.unknown(),
    reason: z.string().min(1),
    source: intelligenceSourceEnum,
    createdAt: z.string().datetime(),
  })
  .strict();

export const normalizedCandidateSchema = z
  .object({
    id: z.string().min(1),
    source: z.enum([
      "directory",
      "research",
      "calendar",
      "contacts",
      "memory",
      "manual",
    ]),
    kind: z.enum([
      "place",
      "event",
      "person",
      "calendar_event",
      "task",
      "memory_signal",
      "weather_signal",
      "route_signal",
      "north_goal",
    ]),
    title: z.string().min(1),
    subtitle: z.string().optional(),
    description: z.string().optional(),
    datetime: z.string().optional(),
    location: z
      .object({
        name: z.string().optional(),
        address: z.string().optional(),
        lat: z.number().optional(),
        lng: z.number().optional(),
        neighborhood: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
      })
      .strict()
      .optional(),
    tags: z.array(z.string()).default([]),
    raw: z.unknown().optional(),
  })
  .strict();

export const memoryUpdateProposalSchema = z
  .object({
    id: z.string().min(1),
    type: memoryTypeEnum,
    content: z.string().min(1),
    confidence: z.number().min(0).max(1),
    shouldSave: z.boolean(),
    reason: z.string().min(1),
    evidence: z.array(z.string()).default([]),
    requiresUserApproval: z.boolean(),
  })
  .strict();

const behaviorLearningSchema = z
  .object({
    category: z.string().optional(),
    vibe: z.string().optional(),
    sourceDomain: z.string().optional(),
    purposeLabel: z.string().optional(),
    confidence: z.number().min(0).max(1).optional(),
    reasonSurfaced: z.string().optional(),
    actionTitle: z.string().optional(),
    passReason: z.string().optional(),
  })
  .strict();

export const userBehaviorSignalSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("radar.save"),
      itemId: z.string().min(1),
      learning: behaviorLearningSchema.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("radar.pass"),
      itemId: z.string().min(1),
      learning: behaviorLearningSchema.optional(),
    })
    .strict(),
  z.object({ type: z.literal("plan.open"), planId: z.string().min(1) }).strict(),
  z.object({ type: z.literal("plan.activate"), planId: z.string().min(1) }).strict(),
  z.object({ type: z.literal("plan.complete"), planId: z.string().min(1) }).strict(),
  z.object({ type: z.literal("plan.cancel"), planId: z.string().min(1) }).strict(),
  z.object({ type: z.literal("timeline.complete"), itemId: z.string().min(1) }).strict(),
  z
    .object({
      type: z.literal("memory.accept"),
      memoryProposalId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("memory.reject"),
      memoryProposalId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("memory.archive"),
      memoryProposalId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("item.show"),
      itemId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("item.open"),
      itemId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("item.save"),
      itemId: z.string().min(1),
      category: z.string().optional(),
      learning: behaviorLearningSchema.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("item.pass"),
      itemId: z.string().min(1),
      category: z.string().optional(),
      learning: behaviorLearningSchema.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("item.plan"),
      itemId: z.string().min(1),
      planId: z.string().optional(),
      learning: behaviorLearningSchema.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("item.complete"),
      itemId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("item.archive"),
      itemId: z.string().min(1),
      learning: behaviorLearningSchema.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("item.restore"),
      itemId: z.string().min(1),
    })
    .strict(),
]);
export type UserBehaviorSignalInput = z.infer<typeof userBehaviorSignalSchema>;

export const intelligenceRequestSchema = z
  .object({
    surface: intelligenceSurfaceEnum,
    userMessage: z.string().optional(),
    currentPayload: z.unknown().optional(),
    candidates: z.array(normalizedCandidateSchema).optional(),
    decisionMode: decisionModeEnum.optional(),
  })
  .strict();
export type IntelligenceRequestInput = z.infer<typeof intelligenceRequestSchema>;

export const intelligenceResponseSchema = z
  .object({
    routed: z.array(routedIntelligenceSchema),
    payloads: z
      .object({
        today: z.unknown().optional(),
        radar: z.unknown().optional(),
        circle: z.unknown().optional(),
        north: z.unknown().optional(),
        planDetails: z.unknown().optional(),
      })
      .strict(),
    memoryProposals: z.array(memoryUpdateProposalSchema),
    explanation: z.string(),
  })
  .strict();

export const memoryProposalActionSchema = z
  .object({
    id: z.string().uuid(),
    action: z.enum(["accept", "reject", "archive", "snooze"]),
  })
  .strict();
export type MemoryProposalActionInput = z.infer<
  typeof memoryProposalActionSchema
>;

export const memoryProposalsResponseSchema = z
  .object({
    proposals: z.array(memoryUpdateProposalSchema),
  })
  .strict();

export const okResponseSchema = z.object({ ok: z.literal(true) }).strict();

export const apiEnvelopeSchema = z.object({ data: unknownRecord.optional() });

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
