/** POST /api/finds/refine — refine an existing find in place ("darker",
 *  "under $300", "more old-school") and rerank, never start over. */
import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { refineFind } from "@/lib/finds/finds";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const owner = await requireOwner();
    const body = (await req.json().catch(() => ({}))) as { item_id?: string; refine?: string };
    if (!body.item_id || !body.refine?.trim()) {
      return NextResponse.json({ ok: false, error: "item_id + refine required" }, { status: 400 });
    }
    const result = await refineFind({ userId: owner.id, itemId: body.item_id, refine: body.refine.trim() });
    if (!result.ok) return NextResponse.json({ ok: false, error: "Find not found" }, { status: 404 });
    return NextResponse.json({ ok: true, mission: result.dossier?.mission_title, best: result.dossier?.best_pick?.name ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Refine failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
