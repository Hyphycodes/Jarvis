"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth";
import { recordBehaviorSignal } from "@/lib/memory/behaviorSignals";
import {
  getIndexItem,
  updateIndexItemStatus,
} from "@/lib/index/repo";
import type { Json } from "@/lib/types/database";
import type { UserBehaviorSignal } from "@/lib/memory/types";
import type { IndexItemStatus } from "@/lib/index/types";

type ItemActionResult = {
  ok: true;
  status: IndexItemStatus;
};

async function transition(
  itemId: string,
  nextStatus: IndexItemStatus,
  signal: UserBehaviorSignal,
  options: { revalidate?: string[]; patchPayload?: Record<string, unknown> } = {},
): Promise<ItemActionResult> {
  await requireOwner();
  const existing = await getIndexItem(itemId);
  if (!existing) throw new Error("Index item not found.");

  const patch: { payload?: Json } = {};
  if (options.patchPayload) {
    const current = isRecord(existing.rawPayload) ? existing.rawPayload : {};
    patch.payload = { ...current, ...options.patchPayload } as Json;
  }

  await updateIndexItemStatus(itemId, nextStatus, patch);
  await recordBehaviorSignal(signal);

  for (const path of options.revalidate ?? defaultRevalidate(existing.destination)) {
    revalidatePath(path);
  }

  return { ok: true, status: nextStatus };
}

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

export async function saveItem(input: { itemId: string }): Promise<ItemActionResult> {
  const item = await getIndexItem(input.itemId);
  return transition(input.itemId, "saved", {
    type: "item.save",
    itemId: input.itemId,
    category: item?.category,
  });
}

export async function passItem(input: { itemId: string }): Promise<ItemActionResult> {
  const item = await getIndexItem(input.itemId);
  return transition(input.itemId, "passed", {
    type: "item.pass",
    itemId: input.itemId,
    category: item?.category,
  });
}

export async function planItem(input: {
  itemId: string;
  planId?: string;
}): Promise<ItemActionResult> {
  return transition(
    input.itemId,
    "planned",
    { type: "item.plan", itemId: input.itemId, planId: input.planId },
    {
      patchPayload: input.planId ? { plan_id: input.planId } : undefined,
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
  });
}

export async function restoreItem(input: { itemId: string }): Promise<ItemActionResult> {
  return transition(input.itemId, "discovered", {
    type: "item.restore",
    itemId: input.itemId,
  });
}

export type ItemAction =
  | "show"
  | "open"
  | "save"
  | "pass"
  | "plan"
  | "complete"
  | "archive"
  | "restore";

export async function dispatchItemAction(
  action: ItemAction,
  input: { itemId: string; planId?: string },
): Promise<ItemActionResult> {
  switch (action) {
    case "show":
      return showItem({ itemId: input.itemId });
    case "open":
      return openItem({ itemId: input.itemId });
    case "save":
      return saveItem({ itemId: input.itemId });
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
  }
}

function defaultRevalidate(destination: string): string[] {
  switch (destination) {
    case "today":
      return ["/", "/account/history"];
    case "radar":
      return ["/radar", "/account/history"];
    case "north":
      return ["/north", "/account/history"];
    case "circle":
      return ["/circle", "/account/history"];
    case "plan":
      return ["/plan/sparrow", "/account/history"];
    default:
      return ["/account/history"];
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
