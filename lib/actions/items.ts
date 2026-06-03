"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { recordBehaviorSignal } from "@/lib/memory/behaviorSignals";
import { behaviorMetadataForItem } from "@/lib/intelligence/memoryWriteback";
import { buildIntelligenceReason } from "@/lib/brain/intelligenceReason";
import {
  safeWriteIntelligenceTrace,
  type IntelligenceTraceSurface,
} from "@/lib/brain/intelligenceTrace";
import { updateSourceStatsFromAction } from "@/lib/library/sourceGraph";
import {
  buildItemIntentPayload,
  intentJson,
  type UserItemIntent,
} from "@/lib/items/intents";
import {
  getIndexItem,
  updateIndexItemStatus,
} from "@/lib/index/repo";
import type { Json } from "@/lib/types/database";
import type { UserBehaviorSignal } from "@/lib/memory/types";
import type {
  IndexDestination,
  IndexItemStatus,
  IndexedItem,
} from "@/lib/index/types";

export type ItemActionResult = {
  ok: true;
  status: IndexItemStatus;
  destination?: IndexDestination;
};

// ── Core transition helper ────────────────────────────────────────────────────

async function transition(
  itemId: string,
  nextStatus: IndexItemStatus,
  signal: UserBehaviorSignal,
  options: {
    revalidate?: string[];
    patchPayload?: Record<string, unknown>;
    planningState?: string;
    nextDestination?: IndexDestination;
  } = {},
): Promise<ItemActionResult> {
  const owner = await requireOwner();
  const existing = await getIndexItem(itemId);
  if (!existing) throw new Error("Index item not found.");

  // Build payload patch
  const patch: { payload?: Json } = {};
  if (options.patchPayload) {
    const current = isRecord(existing.rawPayload) ? existing.rawPayload : {};
    patch.payload = { ...current, ...options.patchPayload } as Json;
  }

  // Update status (and optional payload)
  await updateIndexItemStatus(itemId, nextStatus, patch);

  if (options.planningState) {
    await updateItemPlanningState(itemId, options.planningState);
  }

  // Optional destination move (separate update — repo doesn't take destination)
  if (options.nextDestination && options.nextDestination !== existing.destination) {
    await updateItemDestination(itemId, options.nextDestination);
  }

  await recordBehaviorSignal(signal);
  const sourceAction = sourceActionForSignal(signal.type);
  if (sourceAction) {
    await updateSourceStatsFromAction({
      userId: owner.id,
      item: existing,
      action: sourceAction,
    });
  }
  await safeWriteIntelligenceTrace({
    userId: owner.id,
    route: "lib/actions/items.transition",
    surface: traceSurfaceForDestination(options.nextDestination ?? existing.destination),
    decisionType: signal.type,
    entityType: "radar_item",
    entityId: itemId,
    contextSummary: {
      now: new Date().toISOString(),
      previous_status: existing.status,
      next_status: nextStatus,
      previous_destination: existing.destination,
      next_destination: options.nextDestination ?? existing.destination,
      category: existing.category,
    },
    reasoning: buildIntelligenceReason({
      summary: `User action ${signal.type} changed ${existing.title}.`,
      contextFactors: [
        existing.category ? `Category: ${existing.category}` : null,
        options.planningState ? `Intent state: ${options.planningState}` : null,
        options.nextDestination && options.nextDestination !== existing.destination
          ? `Moved from ${existing.destination} to ${options.nextDestination}`
          : `Stayed in ${existing.destination}`,
      ],
      behaviorInfluence: [
        signal.type === "item.pass" ? "Pass should reduce similar future confidence." : null,
        signal.type === "item.save" ? "Save should increase similar future confidence." : null,
        signal.type === "item.plan" ? "Plan should increase similar future confidence." : null,
        signal.type === "item.intent" ? "Intent should tune future timing/source/category behavior." : null,
      ],
    }),
    selectedCandidate: {
      item_id: itemId,
      title: existing.title,
      status: nextStatus,
      destination: options.nextDestination ?? existing.destination,
    },
    behaviorInfluence: {
      signal,
    },
    outcome: nextStatus,
  });

  const destinations = uniq([
    existing.destination,
    options.nextDestination,
  ].filter((d): d is IndexDestination => Boolean(d)));
  for (const path of options.revalidate ?? defaultRevalidate(destinations)) {
    revalidatePath(path);
  }

  return {
    ok: true,
    status: nextStatus,
    destination: options.nextDestination ?? existing.destination,
  };
}

function sourceActionForSignal(signalType: UserBehaviorSignal["type"]) {
  switch (signalType) {
    case "item.save":
      return "saved";
    case "item.pass":
      return "passed";
    case "item.plan":
      return "planned";
    case "item.complete":
      return "completed";
    case "item.archive":
      return "archived";
    default:
      return null;
  }
}

function sourceActionForIntent(intent: UserItemIntent) {
  switch (intent) {
    case "saved_reference":
      return "saved";
    case "interested_later":
      return "interested_later";
    case "watching":
      return "watching";
    case "planning_soon":
      return "planned";
    case "better_version":
      return "better_version";
    case "muted":
      return "muted";
    case "passed":
      return "passed";
    case "completed":
      return "completed";
    default:
      return null;
  }
}

function traceSurfaceForDestination(destination: IndexDestination): IntelligenceTraceSurface {
  switch (destination) {
    case "today":
      return "today";
    case "circle":
      return "circle";
    case "north":
      return "north";
    case "plan":
      return "plan";
    default:
      return "radar";
  }
}

async function updateItemDestination(
  itemId: string,
  destination: IndexDestination,
): Promise<void> {
  const owner = await requireOwner();
  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("surfaced_items")
    .update({ destination })
    .eq("id", itemId)
    .eq("user_id", owner.id);
  if (error) throw new Error(error.message);
}

async function updateItemPlanningState(
  itemId: string,
  planningState: string,
): Promise<void> {
  const owner = await requireOwner();
  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("surfaced_items")
    .update({ planning_state: planningState })
    .eq("id", itemId)
    .eq("user_id", owner.id);
  if (error) throw new Error(error.message);
}

// ── Existing actions (preserved) ─────────────────────────────────────────────

export async function showItem(input: { itemId: string }): Promise<ItemActionResult> {
  return transition(input.itemId, "shown", {
    type: "item.show",
    itemId: input.itemId,
  });
}

export async function openItem(input: { itemId: string }): Promise<ItemActionResult> {
  return transition(input.itemId, "opened", {
    type: "item.open",
    itemId: input.itemId,
  });
}

/**
 * Save behavior (Sprint 3):
 * - Dated item with starts_at today → destination="today"
 * - Dated item with starts_at in the future → destination="upcoming"
 * - Undated item → destination="holding" (still saved)
 *
 * Callers may pass an explicit destination to override this behavior.
 */
export async function saveItem(input: {
  itemId: string;
  destination?: IndexDestination;
}): Promise<ItemActionResult> {
  const item = await getIndexItem(input.itemId);
  const nextDestination =
    input.destination ?? inferSaveDestination(item ?? undefined);
  return transition(
    input.itemId,
    "saved",
    {
      type: "item.save",
      itemId: input.itemId,
      category: item?.category,
      learning: behaviorMetadataForItem(item, "save"),
    },
    { nextDestination },
  );
}

export async function passItem(input: { itemId: string }): Promise<ItemActionResult> {
  const item = await getIndexItem(input.itemId);
  return transition(input.itemId, "passed", {
    type: "item.pass",
    itemId: input.itemId,
    category: item?.category,
    learning: behaviorMetadataForItem(item, "pass"),
  });
}

export async function planItem(input: {
  itemId: string;
  planId?: string;
}): Promise<ItemActionResult> {
  const item = await getIndexItem(input.itemId);
  // When an item is planned with a known starts_at, also surface it in Upcoming
  // (or Today if it's actually today). Otherwise leave its destination alone.
  const nextDestination = inferSaveDestination(item ?? undefined);
  return transition(
    input.itemId,
    "planned",
    {
      type: "item.plan",
      itemId: input.itemId,
      planId: input.planId,
      learning: behaviorMetadataForItem(item, "save"),
    },
    {
      patchPayload: input.planId
        ? {
            plan_id: input.planId,
            plan_status: "active",
            ...(item ? { intent: intentJson(buildItemIntentPayload({ item, intent: "planning_soon" })) } : {}),
          }
        : { plan_status: "draft" },
      planningState: "planning_soon",
      nextDestination,
    },
  );
}

export async function completeItem(input: { itemId: string }): Promise<ItemActionResult> {
  return transition(input.itemId, "completed", {
    type: "item.complete",
    itemId: input.itemId,
  });
}

export async function archiveItem(input: { itemId: string }): Promise<ItemActionResult> {
  return transition(input.itemId, "archived", {
    type: "item.archive",
    itemId: input.itemId,
    learning: behaviorMetadataForItem(await getIndexItem(input.itemId), "archive"),
  });
}

/**
 * Restore an item from passed/archived/expired.
 * - If item is time-sensitive and still upcoming → destination="upcoming"
 * - Otherwise → destination="holding"
 */
export async function restoreItem(input: { itemId: string }): Promise<ItemActionResult> {
  const item = await getIndexItem(input.itemId);
  const nextDestination: IndexDestination = item && isFutureDated(item)
    ? isToday(item.startsAt)
      ? "today"
      : "upcoming"
    : "holding";
  return transition(
    input.itemId,
    "discovered",
    {
      type: "item.restore",
      itemId: input.itemId,
    },
    { nextDestination },
  );
}

// ── New actions (Sprint 3) ───────────────────────────────────────────────────

/**
 * Move an item to a specific destination without changing its status.
 * Used by the universal item detail page for explicit "Move to X" actions.
 */
export async function moveItemToDestination(input: {
  itemId: string;
  destination: IndexDestination;
}): Promise<ItemActionResult> {
  const item = await getIndexItem(input.itemId);
  if (!item) throw new Error("Index item not found.");
  return transition(
    input.itemId,
    item.status,
    {
      type: "item.save",
      itemId: input.itemId,
      category: item.category,
    },
    { nextDestination: input.destination },
  );
}

/**
 * Add an item to Upcoming. Status becomes "saved" if not already in a
 * stronger lifecycle state. Adds plan_status hint if missing.
 */
export async function addToUpcoming(input: { itemId: string }): Promise<ItemActionResult> {
  const item = await getIndexItem(input.itemId);
  if (!item) throw new Error("Index item not found.");
  const status: IndexItemStatus =
    item.status === "planned" || item.status === "saved" ? item.status : "saved";
  return transition(
    input.itemId,
    status,
    { type: "item.save", itemId: input.itemId, category: item.category },
    { nextDestination: "upcoming" },
  );
}

/**
 * Remove an item from Upcoming. If still dated and future, routes to holding;
 * else routes to holding either way (Upcoming is just a destination, not status).
 */
export async function removeFromUpcoming(input: {
  itemId: string;
}): Promise<ItemActionResult> {
  const item = await getIndexItem(input.itemId);
  if (!item) throw new Error("Index item not found.");
  return transition(
    input.itemId,
    item.status,
    { type: "item.archive", itemId: input.itemId },
    { nextDestination: "holding" },
  );
}

/**
 * Force a Radar move. Status becomes "shown" so it appears on Active Radar.
 */
export async function moveItemToRadar(input: { itemId: string }): Promise<ItemActionResult> {
  return transition(
    input.itemId,
    "shown",
    { type: "item.show", itemId: input.itemId },
    { nextDestination: "radar" },
  );
}

/**
 * Force a Holding move. Status reset to "discovered" so curator can pick it.
 */
export async function moveItemToHolding(input: { itemId: string }): Promise<ItemActionResult> {
  return transition(
    input.itemId,
    "discovered",
    { type: "item.archive", itemId: input.itemId },
    { nextDestination: "holding" },
  );
}

export async function markItemIntent(input: {
  itemId: string;
  intent: UserItemIntent;
  reason?: string | null;
}): Promise<ItemActionResult> {
  const item = await getIndexItem(input.itemId);
  if (!item) throw new Error("Index item not found.");
  const payload = buildItemIntentPayload({
    item,
    intent: input.intent,
    reason: input.reason,
  });
  const nextStatus = statusForIntent(input.intent, item.status);
  const nextDestination = destinationForIntent(input.intent, item);
  const result = await transition(
    input.itemId,
    nextStatus,
    {
      type: "item.intent",
      itemId: input.itemId,
      intent: input.intent,
      category: item.category,
      learning: {
        ...behaviorMetadataForItem(item, input.intent === "muted" || input.intent === "passed" ? "pass" : "save"),
        intent: input.intent,
        watchConditions: payload.watch_conditions,
      },
    },
    {
      patchPayload: { intent: intentJson(payload) },
      planningState: input.intent,
      nextDestination,
    },
  );
  const owner = await requireOwner();
  const sourceAction = sourceActionForIntent(input.intent);
  if (sourceAction) {
    await updateSourceStatsFromAction({
      userId: owner.id,
      item,
      action: sourceAction,
    });
  }
  return result;
}

/**
 * Explicit expire. Used when an event's date has passed.
 */
export async function expireItem(input: { itemId: string }): Promise<ItemActionResult> {
  return transition(input.itemId, "expired", {
    type: "item.archive",
    itemId: input.itemId,
  });
}

// ── Dispatcher ──────────────────────────────────────────────────────────────

export type ItemAction =
  | "show"
  | "open"
  | "save"
  | "pass"
  | "plan"
  | "complete"
  | "archive"
  | "restore"
  | "move-radar"
  | "move-holding"
  | "add-upcoming"
  | "remove-upcoming"
  | "expire"
  | "save-taste"
  | "interested-later"
  | "watch"
  | "better-version"
  | "mute";

export async function dispatchItemAction(
  action: ItemAction,
  input: { itemId: string; planId?: string; destination?: IndexDestination },
): Promise<ItemActionResult> {
  switch (action) {
    case "show":
      return showItem({ itemId: input.itemId });
    case "open":
      return openItem({ itemId: input.itemId });
    case "save":
      return saveItem({ itemId: input.itemId, destination: input.destination });
    case "pass":
      return passItem({ itemId: input.itemId });
    case "plan":
      return planItem(input);
    case "complete":
      return completeItem({ itemId: input.itemId });
    case "archive":
      return archiveItem({ itemId: input.itemId });
    case "restore":
      return restoreItem({ itemId: input.itemId });
    case "move-radar":
      return moveItemToRadar({ itemId: input.itemId });
    case "move-holding":
      return moveItemToHolding({ itemId: input.itemId });
    case "add-upcoming":
      return addToUpcoming({ itemId: input.itemId });
    case "remove-upcoming":
      return removeFromUpcoming({ itemId: input.itemId });
    case "expire":
      return expireItem({ itemId: input.itemId });
    case "save-taste":
      return markItemIntent({ itemId: input.itemId, intent: "saved_reference" });
    case "interested-later":
      return markItemIntent({ itemId: input.itemId, intent: "interested_later" });
    case "watch":
      return markItemIntent({ itemId: input.itemId, intent: "watching" });
    case "better-version":
      return markItemIntent({ itemId: input.itemId, intent: "better_version" });
    case "mute":
      return markItemIntent({ itemId: input.itemId, intent: "muted" });
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function inferSaveDestination(item?: IndexedItem): IndexDestination {
  if (!item) return "holding";
  if (!item.startsAt) return "holding";
  return isToday(item.startsAt) ? "today" : "upcoming";
}

function isToday(iso?: string | null): boolean {
  if (!iso) return false;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return false;
    const now = new Date();
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  } catch {
    return false;
  }
}

function isFutureDated(item: IndexedItem): boolean {
  if (!item.startsAt) return false;
  try {
    return new Date(item.startsAt).getTime() >= Date.now();
  } catch {
    return false;
  }
}

function statusForIntent(intent: UserItemIntent, current: IndexItemStatus): IndexItemStatus {
  switch (intent) {
    case "planning_soon":
      return "planned";
    case "passed":
    case "muted":
      return "passed";
    case "completed":
      return "completed";
    case "active_now":
      return "shown";
    case "saved_reference":
      return "saved";
    case "interested_later":
    case "watching":
    case "better_version":
      return current === "saved" || current === "planned" ? current : "discovered";
  }
}

function destinationForIntent(intent: UserItemIntent, item: IndexedItem): IndexDestination {
  switch (intent) {
    case "active_now":
      return "radar";
    case "planning_soon":
      return inferSaveDestination(item);
    case "passed":
    case "muted":
      return item.destination;
    case "interested_later":
    case "watching":
    case "better_version":
    case "saved_reference":
    case "completed":
      return "holding";
  }
}

function defaultRevalidate(destinations: IndexDestination[]): string[] {
  const paths = new Set<string>(["/account/history", "/item"]);
  for (const d of destinations) {
    switch (d) {
      case "today":
        paths.add("/");
        break;
      case "radar":
        paths.add("/radar");
        break;
      case "north":
        paths.add("/north");
        break;
      case "circle":
        paths.add("/circle");
        break;
      case "plan":
        paths.add("/plan/sparrow");
        break;
      case "holding":
        paths.add("/account/history");
        break;
      case "upcoming":
        paths.add("/upcoming");
        paths.add("/");
        break;
    }
  }
  return Array.from(paths);
}

function uniq<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
