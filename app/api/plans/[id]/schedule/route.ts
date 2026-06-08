/**
 * POST /api/plans/[id]/schedule
 *
 * Phase 9: persist the date/time chosen in the date picker.
 * Body: { scheduled_date: "YYYY-MM-DD", scheduled_time: "HH:MM" }
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { schedulePlan } from "@/lib/actions/plans";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.string().uuid() });
const bodySchema = z.object({
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scheduled_time: z.string().regex(/^\d{2}:\d{2}$/),
  timezone: z.string().optional(),
});

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = paramsSchema.parse(await ctx.params);
    const body = bodySchema.parse(await request.json());
    const result = await schedulePlan({
      planId: id,
      scheduledDate: body.scheduled_date,
      scheduledTime: body.scheduled_time,
      timezone: body.timezone,
    });
    return NextResponse.json(result);
  } catch (error) {
    return handleError(error);
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
