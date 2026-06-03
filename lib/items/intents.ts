import type { IndexedItem } from "@/lib/index/types";
import type { Json } from "@/lib/types/database";

export type UserItemIntent =
  | "active_now"
  | "saved_reference"
  | "interested_later"
  | "watching"
  | "planning_soon"
  | "better_version"
  | "passed"
  | "muted"
  | "completed";

export type WatchConditions = {
  [key: string]: Json | undefined;
  timing?: string[];
  people?: string[];
  weather?: string[];
  budget?: string;
  location_scope?: string;
  better_version_notes?: string;
};

export type ItemIntentPayload = {
  state: UserItemIntent;
  source: "owner_action" | "system";
  updated_at: string;
  watch_conditions?: WatchConditions;
  reason?: string;
};

export function buildItemIntentPayload(input: {
  item: IndexedItem;
  intent: UserItemIntent;
  reason?: string | null;
  now?: string;
}): ItemIntentPayload {
  return {
    state: input.intent,
    source: "owner_action",
    updated_at: input.now ?? new Date().toISOString(),
    watch_conditions: watchConditionsForItem(input.item, input.intent),
    reason: input.reason ?? intentReason(input.intent),
  };
}

export function readItemIntent(payload: unknown): ItemIntentPayload | null {
  if (!isRecord(payload)) return null;
  const intent = payload.intent;
  if (!isRecord(intent)) return null;
  const state = intent.state;
  if (!isUserItemIntent(state)) return null;
  return {
    state,
    source: intent.source === "system" ? "system" : "owner_action",
    updated_at: typeof intent.updated_at === "string" ? intent.updated_at : "",
    watch_conditions: isRecord(intent.watch_conditions)
      ? intent.watch_conditions as WatchConditions
      : undefined,
    reason: typeof intent.reason === "string" ? intent.reason : undefined,
  };
}

export function isUserItemIntent(value: unknown): value is UserItemIntent {
  return typeof value === "string" && [
    "active_now",
    "saved_reference",
    "interested_later",
    "watching",
    "planning_soon",
    "better_version",
    "passed",
    "muted",
    "completed",
  ].includes(value);
}

export function intentLabel(intent: UserItemIntent): string {
  return intent.replace(/_/g, " ");
}

export function intentReason(intent: UserItemIntent): string {
  switch (intent) {
    case "saved_reference":
      return "Owner saved as a reference/taste signal.";
    case "interested_later":
      return "Owner likes the idea but not the timing.";
    case "watching":
      return "Owner wants Jarvis to keep monitoring this lane/source.";
    case "planning_soon":
      return "Owner wants this turned into a plan soon.";
    case "better_version":
      return "Owner likes the lane/category but wants a stronger version.";
    case "muted":
      return "Owner wants this item/source/category muted.";
    case "passed":
      return "Owner passed on this item.";
    case "completed":
      return "Owner completed this.";
    default:
      return "Owner wants this active now.";
  }
}

export function intentJson(payload: ItemIntentPayload): Json {
  return payload as unknown as Json;
}

function watchConditionsForItem(item: IndexedItem, intent: UserItemIntent): WatchConditions | undefined {
  if (!["interested_later", "watching", "better_version"].includes(intent)) return undefined;
  const text = [
    item.title,
    item.category,
    item.type,
    item.description,
    item.tags.join(" "),
  ].filter(Boolean).join(" ").toLowerCase();
  const conditions: WatchConditions = {};

  if (/horse|trail|outdoor|park|pickleball|sport|golf|boxing|activity/.test(text)) {
    conditions.timing = ["weekend"];
    conditions.weather = ["clear", "warm", "outdoor-friendly"];
    conditions.people = ["small group", "activity partner"];
    conditions.better_version_notes = "Prefer scenic, specific, and not touristy.";
  } else if (/dinner|restaurant|bar|lounge|jazz|music|culture|gallery/.test(text)) {
    conditions.timing = ["evening", "weekend"];
    conditions.better_version_notes = "Prefer quality/service/atmosphere without clubby or try-hard energy.";
  } else if (/event|concert|show|game/.test(text)) {
    conditions.timing = ["next_30_days"];
    conditions.better_version_notes = "Require specific date, venue, and source.";
  }

  if (/bolingbrook|naperville/.test(text)) conditions.location_scope = "Bolingbrook/Naperville";
  if (/gold coast|lincoln park|fulton market|logan square/.test(text)) conditions.location_scope = "known Chicago movement zone";
  return Object.keys(conditions).length > 0 ? conditions : { timing: ["when context improves"] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
