/**
 * POST /api/items/[id]/generate-plan
 *
 * Generates (or returns the existing) plan for a source item.
 * Body: { force?: boolean }
 *
 * Never automatic. Only invoked by explicit user action on the item
 * detail page. Returns a clean envelope — never raw Claude output.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { generatePlanForItem } from "@/lib/actions/plans";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const paramsSchema = z.object({ id: z.string().uuid() });
const bodySchema = z
  .object({ force: z.boolean().optional() })
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

    const result = await generatePlanForItem({
      itemId: id,
      force: parsed?.force ?? false,
    });

    return NextResponse.json({
      ok: result.ok,
      plan_id: result.planId,
      plan_slug: result.planSlug,
      status: result.status,
      fallback_used: result.fallbackUsed,
      reused: result.reused ?? false,
    });
  } catch (error) {
    return handleError(error);
  }
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
