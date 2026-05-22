import { z } from "zod";
import type { Json } from "@/lib/types/database";

export const briefingActionSchema = z.enum([
  "save",
  "pass",
  "hold",
  "plan",
  "research",
  "watch",
  "ignore",
]);

export const briefingDestinationSchema = z.enum([
  "radar",
  "holding",
  "discovered",
  "archived",
]);

export const briefingQualityFlagSchema = z.enum([
  "seo_junk",
  "instagram_noise",
  "social_noise",
  "raw_comment",
  "too_literal",
  "weak_evidence",
  "generic",
  "poor_timing",
  "too_expensive",
  "too_far",
  "not_actionable",
  "needs_verification",
  "closed_event",
  "expired_event",
  "directory_spam",
  "misclassified",
  "title_unclear",
  "no_clear_move",
  "source_lead_only",
  "no_current_value",
]);

export const itemBriefingSchema = z.object({
  display_title: z.string().min(1).max(120),
  display_category: z.string().min(1).max(48),
  one_line: z.string().min(1).max(180),
  jarvis_take: z.string().min(1).max(360),
  why_it_matters: z.string().min(1).max(360),
  why_now: z.string().max(220).optional(),
  best_next_action: briefingActionSchema,
  confidence: z.number().min(0).max(1),
  confidence_label: z.enum(["low", "medium", "high"]),
  effort_level: z.enum(["low", "medium", "high"]),
  spending_posture: z.enum(["free", "low", "paid", "high", "unknown"]),
  suggested_destination: briefingDestinationSchema,
  quality_flags: z.array(briefingQualityFlagSchema).default([]),
  evidence_summary: z.string().min(1).max(360),
  cleaned_tags: z.array(z.string().min(1).max(40)).max(10).default([]),
});

export type ItemBriefing = z.infer<typeof itemBriefingSchema>;
export type BriefingQualityFlag = z.infer<typeof briefingQualityFlagSchema>;

export type BriefingMeta = {
  source_fingerprint?: string;
  generated_at?: string;
  fallback_used?: boolean;
  fallback_reason?: string;
};

export function readBriefingFromPayload(payload: unknown): ItemBriefing | null {
  if (!isRecord(payload)) return null;
  const parsed = itemBriefingSchema.safeParse(payload.briefing);
  return parsed.success ? parsed.data : null;
}

export function readBriefingMetaFromPayload(payload: unknown): BriefingMeta | null {
  if (!isRecord(payload) || !isRecord(payload.briefing_meta)) return null;
  return {
    source_fingerprint:
      typeof payload.briefing_meta.source_fingerprint === "string"
        ? payload.briefing_meta.source_fingerprint
        : undefined,
    generated_at:
      typeof payload.briefing_meta.generated_at === "string"
        ? payload.briefing_meta.generated_at
        : undefined,
    fallback_used:
      typeof payload.briefing_meta.fallback_used === "boolean"
        ? payload.briefing_meta.fallback_used
        : undefined,
    fallback_reason:
      typeof payload.briefing_meta.fallback_reason === "string"
        ? payload.briefing_meta.fallback_reason
        : undefined,
  };
}

export function mergeBriefingIntoPayload(
  payload: Json | null | undefined,
  briefing: ItemBriefing,
  meta: BriefingMeta = {},
): Json {
  const base = isRecord(payload) ? payload : {};
  return {
    ...base,
    briefing,
    briefing_meta: {
      ...readBriefingMetaFromPayload(base),
      ...meta,
    },
  } as Json;
}

export function isMajorQualityFlag(flag: string): boolean {
  return [
    "seo_junk",
    "instagram_noise",
    "social_noise",
    "raw_comment",
    "too_literal",
    "weak_evidence",
    "generic",
    "not_actionable",
    "needs_verification",
    "closed_event",
    "expired_event",
    "directory_spam",
    "misclassified",
    "title_unclear",
    "no_clear_move",
    "source_lead_only",
    "no_current_value",
  ].includes(flag);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
