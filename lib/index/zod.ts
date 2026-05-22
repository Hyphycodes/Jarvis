import { z } from "zod";

export const indexItemStatusEnum = z.enum([
  "discovered",
  "shown",
  "opened",
  "saved",
  "passed",
  "planned",
  "completed",
  "expired",
  "archived",
]);

export const indexDestinationEnum = z.enum([
  "today",
  "radar",
  "north",
  "circle",
  "plan",
]);

export const indexItemTypeEnum = z.enum([
  "restaurant",
  "event",
  "culture",
  "place",
  "person",
  "product",
  "travel",
  "real_estate",
  "health",
  "style",
  "creative",
  "faith",
  "task",
  "plan",
  "recommendation",
  "north_step",
  "pillar_signal",
  "relationship_update",
]);

export const indexItemSourceEnum = z.enum([
  "system",
  "manual",
  "ai",
  "memory",
  "directory",
  "research",
  "places",
  "events",
  "calendar",
  "contacts",
]);

const isoDate = z.string().datetime({ offset: true });

export const createIndexedItemSchema = z
  .object({
    type: indexItemTypeEnum,
    destination: indexDestinationEnum,
    title: z.string().trim().min(1).max(200),
    source: indexItemSourceEnum.optional(),
    sourceId: z.string().trim().min(1).optional(),
    category: z.string().trim().optional(),
    subtitle: z.string().trim().optional(),
    description: z.string().trim().optional(),
    locationName: z.string().trim().optional(),
    address: z.string().trim().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
    startsAt: isoDate.optional(),
    endsAt: isoDate.optional(),
    expiresAt: isoDate.optional(),
    url: z.string().url().optional(),
    imageUrl: z.string().url().optional(),
    rawPayload: z.unknown().optional(),
    status: indexItemStatusEnum.optional(),
    score: z.number().min(0).max(1).optional(),
    reasons: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
  })
  .strict();

export const itemActionSchema = z
  .object({
    itemId: z.string().uuid(),
    planId: z.string().uuid().optional(),
    reason: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export type ItemActionInput = z.infer<typeof itemActionSchema>;
