/**
 * POST /api/plans/[id]/[action]
 *
 * Plan lifecycle endpoint: activate | complete | cancel.
 * The existing /api/plans/[id]/live route is preserved for Sparrow.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  activatePlan,
  cancelPlan,
  completePlan,
  unschedulePlan,
} from "@/lib/actions/plans";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ACTIONS = ["activate", "complete", "cancel", "unschedule"] as const;
type Action = (typeof ACTIONS)[number];

const paramsSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(ACTIONS),
});

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string; action: string }> },
) {
  try {
    const { id, action } = paramsSchema.parse(await ctx.params);
    const result = await dispatch(action, id);
    return NextResponse.json(result);
  } catch (error) {
    return handleError(error);
  }
}

async function dispatch(action: Action, planId: string) {
  switch (action) {
    case "activate":
      return activatePlan({ planId });
    case "complete":
      return completePlan({ planId });
    case "cancel":
      return cancelPlan({ planId });
    case "unschedule":
      return unschedulePlan({ planId });
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
