import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { researchAndStore } from "@/lib/actions/placesLibrary";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    await requireOwner();

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });
    }

    const context =
      typeof body.url === "string" || typeof body.snippet === "string"
        ? {
            discoveredUrl: typeof body.url === "string" ? body.url : undefined,
            snippet: typeof body.snippet === "string" ? body.snippet : undefined,
          }
        : undefined;

    const result = await researchAndStore(name, context);

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Research failed";
    const status = /login|owner|auth/i.test(message) ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
