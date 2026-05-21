import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { generateIntelligence } from "@/lib/ai/orchestrator";
import { routeIntelligence } from "@/lib/tools/routeIntelligence";
import {
  intelligenceRequestSchema,
  intelligenceResponseSchema,
} from "@/lib/schemas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await requireUser();
    const body = await request.json();
    const input = intelligenceRequestSchema.parse(body);
    const result = await generateIntelligence(input);
    const routed = routeIntelligence(result);

    const response = intelligenceResponseSchema.parse({
      routed: result.routed,
      payloads: {
        today: routed.today,
        radar: routed.radar,
        circle: routed.circle,
        north: routed.north,
        planDetails: routed.planDetails,
      },
      memoryProposals: routed.memoryProposals,
      explanation: result.explanation,
    });
    return NextResponse.json(response);
  } catch (error) {
    return handleApiError(error);
  }
}

function handleApiError(error: unknown) {
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
