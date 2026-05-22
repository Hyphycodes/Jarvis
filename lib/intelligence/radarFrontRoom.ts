import "server-only";

import { actionTitleForItem } from "@/lib/brain/actionTitles";
import { purposeLabelForItem } from "@/lib/brain/purposeLabels";
import { scoreSourceTrust } from "@/lib/intelligence/sourceTrust";
import type { ItemBriefing } from "@/lib/brain/briefingTypes";
import type { IndexedItem, IndexDestination } from "@/lib/index/types";

export type RadarFrontRoomDecision = {
  allowed: boolean;
  flags: string[];
  reason: string;
  suggestedDestination: Extract<IndexDestination, "radar" | "holding"> | "discovered" | "archived";
  moveTitle: string;
  purposeLabel: string;
};

export const RADAR_FRONT_ROOM_MIN_CONFIDENCE = 0.72;

const BLOCKED_FLAGS = new Set([
  "weak_evidence",
  "social_noise",
  "instagram_noise",
  "raw_comment",
  "too_literal",
  "closed_event",
  "expired_event",
  "misclassified",
  "no_clear_move",
  "title_unclear",
  "directory_spam",
  "seo_junk",
  "source_lead_only",
  "generic",
  "not_actionable",
  "no_current_value",
  "needs_verification",
]);

const TERMINAL_ACTIONS = new Set(["ignore", "pass"]);
const NON_ACTIVE_ACTIONS = new Set(["research", "watch"]);

export function evaluateActiveRadarItem(
  item: IndexedItem,
  briefingOverride?: ItemBriefing,
): RadarFrontRoomDecision {
  const briefing = briefingOverride ?? item.briefing;
  const move = actionTitleForItem({ ...item, briefing });
  const purposeLabel = purposeLabelForItem(item);
  const flags = new Set<string>(move.flags);
  const payload = isRecord(item.rawPayload) ? item.rawPayload : {};
  const trust = scoreSourceTrust({
    url: item.url,
    title: item.title,
    snippet: item.description,
    publishedDate: stringValue(payload.published_date),
    age: stringValue(payload.age),
  });
  for (const flag of trust.qualityFlags) flags.add(flag);

  if (!briefing) {
    flags.add("needs_verification");
    return decision(false, flags, "Missing briefing", "holding", move.title, purposeLabel);
  }

  for (const flag of briefing.quality_flags) flags.add(flag);

  const action = briefing.best_next_action;
  const confidence = Math.min(item.score ?? briefing.confidence, briefing.confidence);
  const cleanTitle = move.title.trim();
  const hasCoreCopy =
    cleanTitle.length >= 4 &&
    briefing.one_line.trim().length >= 12 &&
    briefing.jarvis_take.trim().length >= 12;
  const text = `${briefing.display_title} ${briefing.one_line} ${briefing.jarvis_take} ${briefing.why_it_matters}`.toLowerCase();
  const sourceLeadOnly =
    item.tags.includes("web-result") &&
    !item.locationName &&
    !item.startsAt &&
    item.source === "research" &&
    trust.sourceType !== "trusted";

  if (sourceLeadOnly) flags.add("source_lead_only");
  if (/watch for stronger evidence|needs a better source|not decision-ready|good signal, weak evidence/.test(text)) {
    flags.add("no_current_value");
  }
  if (isExpiredOrClosed(item)) flags.add("expired_event");
  if (!hasCoreCopy) flags.add("no_clear_move");
  if (!validCategory(item)) flags.add("misclassified");
  if (confidence < RADAR_FRONT_ROOM_MIN_CONFIDENCE) flags.add("no_current_value");
  if (
    item.source !== "ai" &&
    item.source !== "places" &&
    item.source !== "events" &&
    trust.trustScore < 0.5
  ) {
    flags.add("weak_evidence");
  }

  const blocked = Array.from(flags).filter((flag) => BLOCKED_FLAGS.has(flag));
  if (TERMINAL_ACTIONS.has(action)) {
    return decision(false, flags, `Terminal action: ${action}`, "archived", cleanTitle, purposeLabel);
  }
  if (NON_ACTIVE_ACTIONS.has(action)) {
    return decision(false, flags, `Not active-ready: ${action}`, "holding", cleanTitle, purposeLabel);
  }
  if (briefing.suggested_destination !== "radar") {
    return decision(
      false,
      flags,
      `Briefing suggested ${briefing.suggested_destination}`,
      briefing.suggested_destination === "archived" ? "archived" : "holding",
      cleanTitle,
      purposeLabel,
    );
  }
  if (blocked.length > 0) {
    return decision(
      false,
      flags,
      `Blocked by ${blocked.join(", ")}`,
      blocked.some((flag) =>
        ["social_noise", "instagram_noise", "raw_comment", "directory_spam", "closed_event", "expired_event", "too_literal"].includes(flag),
      )
        ? "archived"
        : "holding",
      cleanTitle,
      purposeLabel,
    );
  }

  return decision(true, flags, "Front-room ready", "radar", cleanTitle, purposeLabel);
}

function decision(
  allowed: boolean,
  flags: Set<string>,
  reason: string,
  suggestedDestination: RadarFrontRoomDecision["suggestedDestination"],
  moveTitle: string,
  purposeLabel: string,
): RadarFrontRoomDecision {
  return {
    allowed,
    flags: Array.from(flags),
    reason,
    suggestedDestination,
    moveTitle,
    purposeLabel,
  };
}

function validCategory(item: IndexedItem): boolean {
  const category = (item.category ?? "").toLowerCase();
  if (!category) return false;
  if (item.type === "place" && /youtube|instagram|facebook|article|style inspiration/.test(category)) {
    return false;
  }
  return true;
}

function isExpiredOrClosed(item: IndexedItem): boolean {
  const now = Date.now();
  const expires = item.expiresAt ? new Date(item.expiresAt).getTime() : null;
  if (expires && !Number.isNaN(expires) && expires < now) return true;
  const haystack = `${item.title} ${item.description ?? ""} ${item.reasons.join(" ")}`.toLowerCase();
  return /sold out|registration closed|event ended|past event|closed/.test(haystack);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
