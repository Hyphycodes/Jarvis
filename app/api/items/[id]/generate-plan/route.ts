/**
 * POST /api/items/[id]/generate-plan
 *
 * Generates (or returns the existing) plan for a source item.
 * Body: { force?: boolean, chat_context?: { timing_hint?: string, party_size?: number, notes?: string } }
 *
 * Never automatic. Only invoked by explicit user action on the item
 * detail page. Returns a clean envelope — never raw Claude output.
 */

import { after, NextResponse } from "next/server";
import { z } from "zod";
import { createStubPlan, fillPlan } from "@/lib/actions/plans";
import { sendPlanReadyPush } from "@/lib/push/send";
import type { PlanChatContext } from "@/lib/plans/chatContext";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const paramsSchema = z.object({ id: z.string().uuid() });
const bodySchema = z
  .object({
    force: z.boolean().optional(),
    chat_context: z
      .object({
        timing_hint: z.string().min(1).max(120).optional(),
        party_size: z.number().int().min(1).max(20).optional(),
        notes: z.string().min(1).max(500).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .optional();

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = paramsSchema.parse(await ctx.params);
    const body = await safeJson(request);
    const parsed = bodySchema.parse(body);
    const chatContext = normalizeChatContext(parsed?.chat_context);

    const stub = await createStubPlan({
      itemId: id,
      force: parsed?.force ?? false,
      chatContext,
    });

    if (!stub.reused) {
      after(async () => {
        try {
          const filled = await fillPlan({
            planId: stub.planId,
            userId: stub.userId,
            itemId: id,
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
          console.error("[items.generate-plan] background plan fill failed", error);
        }
      });
    }

    return NextResponse.json({
      ok: true,
      plan_id: stub.planId,
      plan_slug: stub.planSlug,
      status: "draft",
      build_status: stub.reused ? "ready" : "building",
      fallback_used: false,
      reused: stub.reused,
    });
  } catch (error) {
    return handleError(error);
  }
}

function normalizeChatContext(value: {
  timing_hint?: string;
  party_size?: number;
  notes?: string;
} | undefined): PlanChatContext | undefined {
  if (!value) return undefined;
  const context: PlanChatContext = {};
  if (value.timing_hint) context.timingHint = value.timing_hint;
  if (value.party_size) context.partySize = value.party_size;
  if (value.notes) context.notes = value.notes;
  return Object.keys(context).length ? context : undefined;
}

async function safeJson(request: Request): Promise<unknown> {
  try {
    const text = await request.text();
    if (!text) return undefined;
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function handleError(error: unknown) {
  if (error instanceof Error) {
    if (error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }
    if (error.message.startsWith("FORBIDDEN")) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ error: "Unknown error" }, { status: 500 });
}
