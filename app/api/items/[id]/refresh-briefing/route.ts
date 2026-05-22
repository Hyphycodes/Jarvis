import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { getIndexItem } from "@/lib/index/repo";
import { editBriefing } from "@/lib/brain/briefingEditor";
import { mergeBriefingIntoPayload } from "@/lib/brain/briefingTypes";
import { buildBrainContext } from "@/lib/brain/context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const owner = await requireOwner();
    const { id } = await params;
    const item = await getIndexItem(id);
    if (!item) {
      return NextResponse.json({ ok: false, error: "Item not found" }, { status: 404 });
    }

    const context = await buildBrainContext();
    const result = await editBriefing({
      context,
      scored: {
        item,
        score: item.score ?? 0.5,
        reasons: item.reasons,
      },
      maxAgeMs: 0,
    });

    const payload = mergeBriefingIntoPayload(item.rawPayload, result.briefing, result.meta);
    const supabase = await getServerSupabase();
    const { error } = await supabase
      .from("surfaced_items")
      .update({ payload, score: result.briefing.confidence })
      .eq("id", item.id)
      .eq("user_id", owner.id);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      fallback_used: result.meta.fallback_used ?? false,
      fallback_reason: result.meta.fallback_reason,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
