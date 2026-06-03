import { after, NextResponse } from "next/server";
import { z } from "zod";
import {
  dispatchItemAction,
  type ItemAction,
} from "@/lib/actions/items";
import { scheduleRadarAutoRefill } from "@/lib/intelligence/radarRefill";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ACTIONS = [
  "show",
  "open",
  "save",
  "pass",
  "plan",
  "complete",
  "archive",
  "restore",
  "move-radar",
  "move-holding",
  "add-upcoming",
  "remove-upcoming",
  "expire",
  "save-taste",
  "interested-later",
  "watch",
  "better-version",
  "mute",
] as const satisfies readonly ItemAction[];

const DESTINATIONS = [
  "today",
  "radar",
  "north",
  "circle",
  "plan",
  "holding",
  "upcoming",
] as const;

const paramsSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(ACTIONS),
});

const bodySchema = z
  .object({
    planId: z.string().uuid().optional(),
    destination: z.enum(DESTINATIONS).optional(),
  })
  .strict()
  .optional();

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; action: string }> },
) {
  try {
    const { id, action } = paramsSchema.parse(await ctx.params);
    const body = await safeJson(request);
    const parsed = bodySchema.parse(body);
    const result = await dispatchItemAction(action, {
      itemId: id,
      planId: parsed?.planId,
      destination: parsed?.destination,
    });
    if (shouldAutoRefill(action)) {
      after(() =>
        scheduleRadarAutoRefill({
          trigger: `item.${action}`,
          itemId: id,
        }),
      );
    }
    return NextResponse.json(result);
  } catch (error) {
    return handleError(error);
  }
}

function shouldAutoRefill(action: ItemAction): boolean {
  return ["save", "pass", "archive", "plan", "move-holding", "add-upcoming"].includes(action);
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
