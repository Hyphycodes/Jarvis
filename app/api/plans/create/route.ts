/**
 * POST /api/plans/create
 *
 * Phase 9: instant Plan This. Creates a plan shell immediately and returns its
 * id/slug so the client can open the date picker without waiting. The heavy
 * generation runs in a background `after()` task.
 *
 * Body: { radar_item_id: string }
 */

import { NextResponse, after } from "next/server";
import { z } from "zod";
import { createStubPlan, fillPlan } from "@/lib/actions/plans";
import { sendPlanReadyPush } from "@/lib/push/send";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({ radar_item_id: z.string().uuid() }).strict();

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const stub = await createStubPlan({ itemId: body.radar_item_id });

    if (!stub.reused) {
      after(async () => {
        try {
          const filled = await fillPlan({
            planId: stub.planId,
            userId: stub.userId,
            itemId: body.radar_item_id,
          });
          if (!filled.cancelled) {
            await sendPlanReadyPush({
              userId: stub.userId,
              planSlug: stub.planSlug,
              planTitle: filled.planTitle ?? "Your plan",
            });
          }
        } catch (error) {
          console.error("[plans.create] background fill", error);
        }
      });
    }

    return NextResponse.json({
      ok: true,
      plan_id: stub.planId,
      plan_slug: stub.planSlug,
      reused: stub.reused,
    });
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
