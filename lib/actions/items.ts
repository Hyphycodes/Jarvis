"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { recordBehaviorSignal } from "@/lib/memory/behaviorSignals";
import { behaviorMetadataForItem } from "@/lib/intelligence/memoryWriteback";
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
    nextDestination?: IndexDestination;
  } = {},
): Promise<ItemActionResult> {
  await requireOwner();
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

  // Optional destination move (separate update — repo doesn't take destination)
  if (options.nextDestination && options.nextDestination !== existing.destination) {
    await updateItemDestination(itemId, options.nextDestination);
  }

  await recordBehaviorSignal(signal);

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
        ? { plan_id: input.planId, plan_status: "active" }
        : { plan_status: "draft" },
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
  | "expire";

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
