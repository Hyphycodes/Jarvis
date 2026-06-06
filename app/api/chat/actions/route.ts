import { after, NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import {
  cancelPlan,
  createStubPlan,
  fillPlan,
  schedulePlan,
} from "@/lib/actions/plans";
import { resolveUserIntentItem } from "@/lib/radar/userIntent";
import { pickPlanDate } from "@/lib/plans/scheduleHint";
import { passItem, saveItem } from "@/lib/actions/items";
import { buildBrainContext } from "@/lib/brain/context";
import { buildIntelligenceReason } from "@/lib/brain/intelligenceReason";
import {
  buildContextTraceSummary,
  safeWriteIntelligenceTrace,
  type IntelligenceTraceSurface,
} from "@/lib/brain/intelligenceTrace";
import { createCanonicalMemory } from "@/lib/memory/memoryStore";
import { recordAiAction } from "@/lib/chat/aiActions";
import { addToRadarFromObservation } from "@/lib/chat/actions/addToRadarFromObservation";
import { stopPlanningChip } from "@/lib/chat/actions/chatActionResponses";
import { recordChatBehaviorSignal } from "@/lib/chat/behaviorSignals";
import { learnSource } from "@/lib/chat/actions/learnSource";
import { updateObservation } from "@/lib/chat/observations";
import { clearChatContextCache } from "@/lib/chat/context/buildChatContext";
import { sendPlanReadyPush } from "@/lib/push/send";
import type { PlanChatContext } from "@/lib/plans/chatContext";
import type { Json } from "@/lib/types/database";
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
    "enable_push",
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
      case "enable_push":
        return NextResponse.json({ ok: true, message: "", chips: [] });
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
  await traceChatAction({
    userId,
    actionType: "save_to_radar",
    surface: "chat",
    entityType: "radar_item",
    entityId: itemId,
    summary: "User confirmed a chat candidate should be kept in Radar.",
    outcome: "saved_to_radar",
    payload,
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
  await traceChatAction({
    userId,
    actionType: "save_item",
    surface: "chat",
    entityType: "radar_item",
    entityId: itemId,
    summary: "User command saved the current item.",
    outcome: "saved",
    payload,
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
  await traceChatAction({
    userId,
    actionType: "pass_item",
    surface: "chat",
    entityType: "radar_item",
    entityId: itemId,
    summary: "User command passed on the current item.",
    outcome: "passed",
    payload,
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
  const candidateId = stringValue(payload?.candidate_id);
  let itemId = stringValue(payload?.item_id);
  // Conversational capture ("make a plan for Naia") → resolve the user-intent
  // candidate into a real surfaced item (researching it now if the background
  // pass hasn't finished). This is what makes the chip's tap actually do work.
  if (!itemId && candidateId) {
    const resolved = await resolveUserIntentItem(userId, candidateId);
    itemId = resolved?.itemId ?? null;
  }
  if (!itemId && observationId) {
    const result = await addToRadarFromObservation({
      userId,
      observationId,
      userConfirmed: true,
    });
    itemId = result.itemId;
  }
  if (!itemId) throw new Error("No Radar item to plan.");
  const chatContext = chatContextFromPayload(payload);

  const stub = await createStubPlan({
    itemId,
    sourceObservationId: observationId ?? undefined,
    chatContext,
  });

  const supabase = await getServerSupabase();
  await supabase
    .from("surfaced_items")
    .update({ planning_state: "planning_in_progress" })
    .eq("id", itemId)
    .eq("user_id", userId);

  // Auto-schedule so the tap actually confirms something: a fixed event keeps
  // its official date; a flexible item gets a sensible best date (inside any
  // hinted window like "this week") that the owner can reschedule.
  const scheduled = await autoSchedulePlan({
    userId,
    planId: stub.planId,
    timingHint: stringValue(payload?.timing_hint),
    supabase,
  });

  if (!stub.reused) {
    after(async () => {
      try {
        const filled = await fillPlan({
          planId: stub.planId,
          userId: stub.userId,
          itemId,
          chatContext,
        });
        if (!filled.cancelled) {
          await sendPlanReadyPush({
            userId: stub.userId,
            planSlug: stub.planSlug,
            planTitle: filled.planTitle ?? "Your plan",
          });
        }
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
  await traceChatAction({
    userId,
    actionType: "build_plan",
    surface: "chat",
    entityType: "plan",
    entityId: stub.planId,
    summary: "User confirmed planning from chat.",
    outcome: stub.reused ? "plan_reused" : "planning_started",
    payload,
    selectedCandidate: {
      item_id: itemId,
      plan_id: stub.planId,
      plan_slug: stub.planSlug,
    },
  });
  clearChatContextCache(userId);

  const planVerb = stub.reused ? "That plan already exists." : "Building your plan now.";
  const scheduleLine = scheduled
    ? scheduled.fixed
      ? ` It's set for ${scheduled.label}.`
      : scheduled.flexible
        ? ` Penciled in for ${scheduled.label} — tap to change the time.`
        : ` Set for ${scheduled.label}.`
    : "";
  const calendarChips: ChatChip[] = scheduled
    ? [
        {
          label: "Add to Calendar",
          message: "Add to calendar.",
          action_type: "add_to_schedule",
          payload: { plan_id: stub.planId, plan_slug: stub.planSlug, ics: true },
        },
        {
          label: "Change Time",
          message: "Change the time.",
          action_type: "add_to_schedule",
          payload: { plan_id: stub.planId },
        },
      ]
    : [stopPlanningChip(stub.planId)];

  return {
    ok: true,
    message: `${planVerb}${scheduleLine}`,
    plan_id: stub.planId,
    plan_slug: stub.planSlug,
    item_id: itemId,
    scheduled_label: scheduled?.label ?? null,
    chips: calendarChips,
  };
}

/**
 * Put a freshly-built plan on the calendar. Fixed (event) plans already carry
 * their official date — we just report it. Flexible plans get a best date from
 * the timing hint (or a sensible default) via schedulePlan.
 */
async function autoSchedulePlan(input: {
  userId: string;
  planId: string;
  timingHint: string | null;
  supabase: Awaited<ReturnType<typeof getServerSupabase>>;
}): Promise<{ label: string; flexible: boolean; fixed: boolean } | null> {
  try {
    const { data } = await input.supabase
      .from("plans")
      .select("key_stats, scheduled_date, date")
      .eq("id", input.planId)
      .eq("user_id", input.userId)
      .maybeSingle();
    const plan = data as { key_stats?: unknown; scheduled_date?: string | null; date?: string | null } | null;
    const keyStats = plan && typeof plan.key_stats === "object" && plan.key_stats !== null
      ? (plan.key_stats as Record<string, unknown>)
      : {};

    // Fixed event: official date is locked — don't reschedule, just report it.
    if (keyStats.schedule_fixed === true) {
      const startsAt = typeof keyStats.starts_at === "string" ? keyStats.starts_at : null;
      const label = startsAt ? formatStartLabel(startsAt) : (plan?.date ?? "its date");
      return { label, flexible: false, fixed: true };
    }
    // Already scheduled: leave it.
    if (plan?.scheduled_date) {
      return { label: plan.date ?? plan.scheduled_date, flexible: false, fixed: false };
    }

    const picked = pickPlanDate(input.timingHint);
    await schedulePlan({
      planId: input.planId,
      scheduledDate: picked.date,
      scheduledTime: picked.time,
    });
    return { label: picked.label, flexible: picked.flexible, fixed: false };
  } catch (error) {
    console.error("[chat.actions] autoSchedulePlan failed", error);
    return null;
  }
}

function formatStartLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const day = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const t = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${day} · ${t}`;
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
  await traceChatAction({
    userId,
    actionType: "remember",
    surface: "chat",
    entityType: "memory",
    entityId: memoryId,
    summary: memoryType === "north_goal"
      ? "User saved chat context as a North memory."
      : "User saved chat context as memory.",
    outcome: "remembered",
    payload,
    selectedCandidate: {
      memory_id: memoryId,
      memory_type: memoryType,
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
  await traceChatAction({
    userId,
    actionType: "not_my_vibe",
    surface: "chat",
    entityType: itemId ? "radar_item" : "observation",
    entityId: itemId ?? observationId,
    summary: "User rejected a chat or item suggestion as not aligned.",
    outcome: itemId ? "passed" : "observation_cancelled",
    payload,
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

async function traceChatAction(input: {
  userId: string;
  actionType: string;
  surface: IntelligenceTraceSurface;
  entityType?: string | null;
  entityId?: string | null;
  summary: string;
  outcome: string;
  payload?: Record<string, unknown>;
  selectedCandidate?: Record<string, unknown>;
}) {
  try {
    const context = await buildBrainContext({
      userId: input.userId,
      includeWeather: false,
    });
    await safeWriteIntelligenceTrace({
      userId: input.userId,
      route: "app/api/chat/actions",
      surface: input.payload?.origin === "voice" ? "voice" : input.surface,
      decisionType: input.actionType,
      entityType: input.entityType,
      entityId: input.entityId,
      contextSummary: buildContextTraceSummary(context),
      reasoning: buildIntelligenceReason({
        summary: input.summary,
        contextFactors: [
          input.payload?.item_id ? `Item: ${String(input.payload.item_id)}` : null,
          input.payload?.observation_id
            ? `Observation: ${String(input.payload.observation_id)}`
            : null,
          input.payload?.memory_type ? `Memory type: ${String(input.payload.memory_type)}` : null,
        ],
      }),
      selectedCandidate: (input.selectedCandidate ?? null) as Json | null,
      behaviorInfluence: {
        action_type: input.actionType,
        payload: input.payload ?? {},
      } as Json,
      outcome: input.outcome,
    });
  } catch (error) {
    console.error("[chat.actions.trace] failed", error);
  }
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function chatContextFromPayload(
  payload: Record<string, unknown> | undefined,
): PlanChatContext | undefined {
  const timingHint =
    stringValue(payload?.timing_hint) ?? stringValue(payload?.timingHint);
  const partySize =
    numberValue(payload?.party_size) ?? numberValue(payload?.partySize);
  const notes = stringValue(payload?.notes);
  const context: PlanChatContext = {};
  if (timingHint) context.timingHint = timingHint;
  if (partySize) context.partySize = partySize;
  if (notes) context.notes = notes;
  return Object.keys(context).length ? context : undefined;
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
