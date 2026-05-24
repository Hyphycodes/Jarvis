import "server-only";

import { enrichRadarItem } from "@/lib/intelligence/core";
import type { IndexedItem } from "@/lib/index/types";
import type { MemoryWritebackSuggestion } from "@/lib/intelligence/types";

export type BehaviorLearningMetadata = {
  category?: string;
  vibe?: string;
  sourceDomain?: string;
  purposeLabel?: string;
  confidence?: number;
  reasonSurfaced?: string;
  actionTitle?: string;
  passReason?: string;
};

export function behaviorMetadataForItem(
  item: IndexedItem | null | undefined,
  kind: "save" | "pass" | "archive" = "save",
): BehaviorLearningMetadata | undefined {
  if (!item) return undefined;
  const radar = enrichRadarItem({ item });
  return {
    category: radar.category,
    vibe: radar.vibe,
    sourceDomain: radar.source.domain,
    purposeLabel: radar.decision.purpose_label,
    confidence: radar.confidence,
    reasonSurfaced: radar.reasonSurfaced,
    actionTitle: radar.title,
    passReason:
      kind === "pass" || kind === "archive"
        ? radar.decision.rejection_reason ?? radar.decision.negative_flags[0] ?? "explicit pass"
        : undefined,
  };
}

export function suggestMemoryWriteback(input: {
  metadata?: BehaviorLearningMetadata;
  action: "save" | "pass" | "plan" | "complete";
}): MemoryWritebackSuggestion[] {
  const meta = input.metadata;
  if (!meta?.vibe && !meta?.purposeLabel) return [];
  if (input.action === "save" || input.action === "plan" || input.action === "complete") {
    return [
      {
        shouldWrite: false,
        kind: "pattern",
        content: `User responded positively to ${meta.purposeLabel ?? meta.vibe}.`,
        confidence: input.action === "complete" ? 0.76 : 0.58,
        reason: "Behavior signal should tune curation immediately; durable memory can be proposed after repetition.",
      },
    ];
  }
  return [
    {
      shouldWrite: false,
      kind: "avoidance",
      content: `User passed on ${meta.purposeLabel ?? meta.vibe}.`,
      confidence: 0.52,
      reason: "Treat as a weak negative signal, not a permanent avoid rule.",
    },
  ];
}

