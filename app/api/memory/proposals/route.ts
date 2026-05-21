import { NextResponse } from "next/server";
import {
  decideMemoryProposal,
  listPendingMemoryProposals,
} from "@/lib/memory/memoryProposals";
import {
  memoryProposalActionSchema,
  memoryProposalsResponseSchema,
  okResponseSchema,
} from "@/lib/schemas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const proposals = await listPendingMemoryProposals();
    return NextResponse.json(memoryProposalsResponseSchema.parse({ proposals }));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = memoryProposalActionSchema.parse(body);
    await decideMemoryProposal(input);
    return NextResponse.json(okResponseSchema.parse({ ok: true }));
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
