import { NextResponse } from "next/server";
import { z } from "zod";
import { toggleTimelineItem } from "@/lib/actions/plans";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.string().uuid() });

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = paramsSchema.parse(await ctx.params);
    const result = await toggleTimelineItem({ timelineItemId: id });
    return NextResponse.json(result);
  } catch (error) {
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
}
