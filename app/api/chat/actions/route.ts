import { after, NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import {
  cancelPlan,
  createStubPlan,
  fillPlan,
} from "@/lib/actions/plans";
import { passItem, saveItem } from "@/lib/actions/items";
import { createCanonicalMemory } from "@/lib/memory/memoryStore";
import { recordAiAction } from "@/lib/chat/aiActions";
import { addToRadarFromObservation } from "@/lib/chat/actions/addToRadarFromObservation";
import { stopPlanningChip } from "@/lib/chat/actions/chatActionResponses";
import { recordChatBehaviorSignal } from "@/lib/chat/behaviorSignals";
import { learnSource } from "@/lib/chat/actions/learnSource";
import { updateObservation } from "@/lib/chat/observations";
import { clearChatContextCache } from "@/lib/chat/context/buildChatContext";
import type { ChatActionType, ChatChip } from "@/lib/chat/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const actionSchema = z.object({
  action_type: z.enum([
    "send_message",
    "save_to_radar",
    "save_item",
    "pass_item",
    "monitor_source",
    "build_plan",
    "stop_planning",
    "remember",
    "find_similar",
    "compare",
    "dismiss",
    "not_my_vibe",
  ] as const),
  message: z.string().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request) {
  try {
    const owner = await requireOwner();
    const body = actionSchema.parse(await request.json());

    switch (body.action_type satisfies ChatActionType) {
      case "save_to_radar":
        return NextResponse.json(await saveToRadar(owner.id, body.payload));
      case "save_item":
        return NextResponse.json(await saveCurrentItem(owner.id, body.payload));
      case "pass_item":
        return NextResponse.json(await passCurrentItem(owner.id, body.payload));
      case "monitor_source":
        return NextResponse.json(await monitorSource(owner.id, body.payload));
      case "build_plan":
        return NextResponse.json(await buildPlan(owner.id, body.payload));
      case "stop_planning":
        return NextResponse.json(await stopPlanning(owner.id, body.payload));
      case "remember":
        return NextResponse.json(await rememberFromChat(owner.id, body.payload));
      case "not_my_vibe":
        return NextResponse.json(await notMyVibe(owner.id, body.payload));
      case "dismiss":
        return NextResponse.json({ ok: true, message: "Done.", chips: [] });
      case "find_similar":
      case "compare":
      case "send_message":
        return NextResponse.json({
          ok: true,
          message: body.message ?? "",
          send_message: true,
          chips: [],
        });
    }
  } catch (error) {
    return handleError(error);
  }
}

async function saveToRadar(
  userId: string,
  payload: Record<string, unknown> | undefined,
) {
  const observationId = stringValue(payload?.observation_id);
  let itemId = stringValue(payload?.item_id);

  if (!itemId && observationId) {
    const result = await addToRadarFromObservation({
      userId,
      observationId,
      userConfirmed: true,
    });
    itemId = result.itemId;
  } else if (itemId) {
    const supabase = await getServerSupabase();
    await supabase
      .from("surfaced_items")
      .update({
        destination: "radar",
        status: "shown",
        planning_state: "saved_to_radar",
      })
      .eq("id", itemId)
      .eq("user_id", userId);
  }

  if (!itemId) throw new Error("No observation or item to save.");

  await recordChatBehaviorSignal({
    userId,
    signalType: "item.save",
    objectType: "radar_item",
    objectId: itemId,
    metadata: { source: "chat_chip", observation_id: observationId ?? null },
  });
  await recordAiAction({
    userId,
    actionType: "save_to_radar",
    inputObservationId: observationId,
    targetTable: "surfaced_items",
    targetId: itemId,
    wasUserConfirmed: true,
    stateAfter: "saved_to_radar",
    reasoningSummary: "User confirmed Save to Radar from chat chip.",
  });
  clearChatContextCache(userId);

  return {
    ok: true,
    message: "Kept it in Radar as a maybe.",
    item_id: itemId,
    chips: [
      {
        label: "Plan It",
        message: "Plan it.",
        action_type: "build_plan",
        payload: { item_id: itemId, observation_id: observationId },
      },
    ] satisfies ChatChip[],
  };
}

async function saveCurrentItem(
  userId: string,
  payload: Record<string, unknown> | undefined,
) {
  const itemId = stringValue(payload?.item_id);
  if (!itemId) throw new Error("No item to save.");

  await saveItem({ itemId });
  await recordChatBehaviorSignal({
    userId,
    signalType: "item.save",
    objectType: "radar_item",
    objectId: itemId,
    metadata: { source: "chat_command" },
  });
  clearChatContextCache(userId);

  return {
    ok: true,
    message: "Saved.",
    item_id: itemId,
    chips: [
      {
        label: "Plan It",
        message: "Plan it.",
        action_type: "build_plan",
        payload: { item_id: itemId },
      },
    ] satisfies ChatChip[],
  };
}

async function passCurrentItem(
  userId: string,
  payload: Record<string, unknown> | undefined,
) {
  const itemId = stringValue(payload?.item_id);
  if (!itemId) throw new Error("No item to pass.");

  await passItem({ itemId });
  await recordChatBehaviorSignal({
    userId,
    signalType: "item.pass",
    objectType: "radar_item",
    objectId: itemId,
    metadata: { source: "chat_command" },
  });
  clearChatContextCache(userId);

  return {
    ok: true,
    message: "Passed. I will steer away from that lane.",
    item_id: itemId,
    chips: [],
  };
}

async function monitorSource(
  userId: string,
  payload: Record<string, unknown> | undefined,
) {
  const observationId = stringValue(payload?.observation_id);
  const handle = stringValue(payload?.account_name);
  const displayName = stringValue(payload?.account_display_name);
  const sourceUrl = stringValue(payload?.source_url);
  const name = displayName ?? handle ?? "Learned source";

  const result = await learnSource({
    userId,
    observationId,
    name,
    instagramHandle: handle,
    url: sourceUrl,
    notes: "Confirmed from chat intake.",
    userConfirmed: true,
  });
  clearChatContextCache(userId);

  return {
    ok: true,
    message: result.reused
      ? "Already monitoring that source."
      : "Monitoring that source now.",
    source_id: result.sourceId,
    chips: [],
  };
}

async function buildPlan(
  userId: string,
  payload: Record<string, unknown> | undefined,
) {
  const observationId = stringValue(payload?.observation_id);
  let itemId = stringValue(payload?.item_id);
  if (!itemId && observationId) {
    const result = await addToRadarFromObservation({
      userId,
      observationId,
      userConfirmed: true,
    });
    itemId = result.itemId;
  }
  if (!itemId) throw new Error("No Radar item to plan.");

  const stub = await createStubPlan({
    itemId,
    sourceObservationId: observationId ?? undefined,
  });

  const supabase = await getServerSupabase();
  await supabase
    .from("surfaced_items")
    .update({ planning_state: "planning_in_progress" })
    .eq("id", itemId)
    .eq("user_id", userId);

  if (!stub.reused) {
    after(async () => {
      try {
        await fillPlan({
          planId: stub.planId,
          userId: stub.userId,
          itemId,
        });
      } catch (error) {
        console.error("[chat.actions] background plan fill failed", error);
      }
    });
  }

  await recordAiAction({
    userId,
    actionType: "start_planning",
    inputObservationId: observationId,
    targetTable: "plans",
    targetId: stub.planId,
    wasUserConfirmed: true,
    stateBefore: "saved_to_radar",
    stateAfter: "planning_in_progress",
    reasoningSummary: "User explicitly tapped Plan It.",
  });
  await recordChatBehaviorSignal({
    userId,
    signalType: "item.plan",
    objectType: "radar_item",
    objectId: itemId,
    metadata: { plan_id: stub.planId, observation_id: observationId ?? null },
  });
  clearChatContextCache(userId);

  return {
    ok: true,
    message: stub.reused ? "That plan already exists." : "Planning this...",
    plan_id: stub.planId,
    plan_slug: stub.planSlug,
    item_id: itemId,
    chips: stub.reused ? [] : [stopPlanningChip(stub.planId)],
  };
}

async function stopPlanning(
  userId: string,
  payload: Record<string, unknown> | undefined,
) {
  const planId = stringValue(payload?.plan_id);
  if (!planId) throw new Error("No plan to stop.");
  await cancelPlan({ planId });
  await recordAiAction({
    userId,
    actionType: "cancel_planning",
    targetTable: "plans",
    targetId: planId,
    wasUserConfirmed: true,
    stateBefore: "planning_in_progress",
    stateAfter: "cancelled",
    reasoningSummary: "User stopped planning from chat chip.",
  });
  clearChatContextCache(userId);
  return {
    ok: true,
    message: "Stopped planning. Kept it in Radar as a maybe.",
    plan_id: planId,
    chips: [],
  };
}

async function rememberFromChat(
  userId: string,
  payload: Record<string, unknown> | undefined,
) {
  const content = stringValue(payload?.memory_content);
  if (!content) throw new Error("No memory content to save.");
  const memoryType = normalizeMemoryType(stringValue(payload?.memory_type));
  const itemId = stringValue(payload?.item_id);

  const memoryId = await createCanonicalMemory({
    type: memoryType,
    content,
    confidence: 0.72,
    source: "explicit",
    tags: itemId ? ["chat", "item_context"] : ["chat"],
    metadata: {
      source: "chat_command",
      item_id: itemId,
    },
  });
  await recordChatBehaviorSignal({
    userId,
    signalType: memoryType === "north_goal" ? "memory.north" : "memory.accept",
    objectType: "memory",
    objectId: memoryId,
    metadata: {
      source: "chat_command",
      memory_type: memoryType,
      content,
      item_id: itemId,
    },
  });
  clearChatContextCache(userId);

  return {
    ok: true,
    message: memoryType === "north_goal" ? "Saved to North memory." : "Remembered.",
    chips: [],
  };
}

async function notMyVibe(
  userId: string,
  payload: Record<string, unknown> | undefined,
) {
  const observationId = stringValue(payload?.observation_id);
  const itemId = stringValue(payload?.item_id);

  if (itemId) {
    await passItem({ itemId });
  }
  if (observationId) {
    await updateObservation({
      userId,
      observationId,
      state: "cancelled",
      metadataPatch: { feedback: "not_my_vibe" },
    });
  }
  await recordChatBehaviorSignal({
    userId,
    signalType: itemId ? "item.pass" : "chat.not_my_vibe",
    objectType: itemId ? "radar_item" : "observation",
    objectId: itemId ?? observationId ?? null,
    metadata: { source: "chat_chip" },
  });
  clearChatContextCache(userId);
  return {
    ok: true,
    message: "Noted. I will steer away from that lane.",
    chips: [],
  };
}

function normalizeMemoryType(value: string | null) {
  switch (value) {
    case "taste":
    case "avoidance":
    case "decision_rule":
    case "relationship":
    case "north_goal":
    case "place_history":
    case "event_history":
    case "confirmed_behavior":
      return value;
    default:
      return "confirmed_behavior";
  }
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function handleError(error: unknown) {
  if (error instanceof Error) {
    if (error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }
    if (error.message.startsWith("FORBIDDEN")) {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: false, error: "Unknown error" }, { status: 500 });
}
