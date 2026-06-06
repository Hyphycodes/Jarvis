import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const owner = await requireOwner();
    const supabase = getSupabaseServiceClient();
    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      item_id?: string;
      keep_id?: string;
      merge_id?: string;
      clarification_id?: string;
      answer?: string;
      patch?: Record<string, unknown>;
      job_id?: string;
    };
    const now = new Date().toISOString();

    switch (body.action) {
      case "delete_item": {
        if (!body.item_id) return bad("item_id required");
        await supabase.from("wardrobe_items").delete().eq("id", body.item_id).eq("user_id", owner.id);
        return NextResponse.json({ ok: true });
      }

      case "update_item": {
        if (!body.item_id || !body.patch) return bad("item_id + patch required");
        const allowed = ["color", "secondary_color", "pattern", "material", "brand", "source", "category", "formality", "fit_silhouette", "style_notes", "description", "condition"];
        const patch: Record<string, unknown> = { updated_at: now, needs_clarification: false };
        for (const k of allowed) if (k in body.patch) patch[k] = body.patch[k];
        await supabase.from("wardrobe_items").update(patch).eq("id", body.item_id).eq("user_id", owner.id);
        return NextResponse.json({ ok: true });
      }

      case "merge_items": {
        if (!body.keep_id || !body.merge_id || body.keep_id === body.merge_id) return bad("keep_id + merge_id required");
        const { data } = await supabase
          .from("wardrobe_items")
          .select("id,color,material,brand,pattern,fit_silhouette,style_notes,times_seen")
          .in("id", [body.keep_id, body.merge_id])
          .eq("user_id", owner.id);
        const rows = (data ?? []) as Array<Record<string, unknown>>;
        const keep = rows.find((r) => r.id === body.keep_id);
        const merge = rows.find((r) => r.id === body.merge_id);
        if (!keep || !merge) return bad("items not found", 404);
        const patch: Record<string, unknown> = {
          times_seen: (num(keep.times_seen) ?? 1) + (num(merge.times_seen) ?? 1),
          last_seen: now,
          updated_at: now,
        };
        for (const f of ["color", "material", "brand", "pattern", "fit_silhouette", "style_notes"]) {
          if (!keep[f] && merge[f]) patch[f] = merge[f];
        }
        await supabase.from("wardrobe_items").update(patch).eq("id", body.keep_id).eq("user_id", owner.id);
        await supabase.from("wardrobe_items").delete().eq("id", body.merge_id).eq("user_id", owner.id);
        return NextResponse.json({ ok: true });
      }

      case "answer_clarification": {
        if (!body.clarification_id) return bad("clarification_id required");
        const answer = typeof body.answer === "string" ? body.answer.trim() : "";
        const { data: cData } = await supabase
          .from("wardrobe_clarifications")
          .select("id,wardrobe_item_id,kind")
          .eq("id", body.clarification_id)
          .eq("user_id", owner.id)
          .maybeSingle();
        const clar = cData as { wardrobe_item_id?: string | null; kind?: string } | null;
        if (clar?.wardrobe_item_id && answer) {
          await applyClarificationAnswer(supabase, owner.id, clar.wardrobe_item_id, clar.kind ?? "detail", answer);
        }
        await supabase
          .from("wardrobe_clarifications")
          .update({ status: "answered", answer: answer || null, updated_at: now })
          .eq("id", body.clarification_id)
          .eq("user_id", owner.id);
        return NextResponse.json({ ok: true });
      }

      case "dismiss_clarification": {
        if (!body.clarification_id) return bad("clarification_id required");
        await supabase
          .from("wardrobe_clarifications")
          .update({ status: "dismissed", updated_at: now })
          .eq("id", body.clarification_id)
          .eq("user_id", owner.id);
        return NextResponse.json({ ok: true });
      }

      case "undo_import": {
        if (!body.job_id) return bad("job_id required");
        const { data: jData } = await supabase
          .from("wardrobe_import_jobs")
          .select("id,result")
          .eq("id", body.job_id)
          .eq("user_id", owner.id)
          .maybeSingle();
        const job = jData as { result?: { created_item_ids?: string[] } | null } | null;
        const ids = Array.isArray(job?.result?.created_item_ids) ? job!.result!.created_item_ids! : [];
        if (ids.length > 0) {
          await supabase.from("wardrobe_items").delete().in("id", ids).eq("user_id", owner.id);
        }
        const nextResult = { ...(job?.result ?? {}), undone: true, created_item_ids: [] };
        await supabase
          .from("wardrobe_import_jobs")
          .update({ result: nextResult, updated_at: now })
          .eq("id", body.job_id)
          .eq("user_id", owner.id);
        return NextResponse.json({ ok: true, removed: ids.length });
      }

      default:
        return bad("unknown action");
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Action failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

async function applyClarificationAnswer(
  supabase: ReturnType<typeof getSupabaseServiceClient>,
  userId: string,
  itemId: string,
  kind: string,
  answer: string,
): Promise<void> {
  const now = new Date().toISOString();
  if (kind === "ownership" && /^no\b/i.test(answer)) {
    // Not the owner's piece — remove it.
    await supabase.from("wardrobe_items").delete().eq("id", itemId).eq("user_id", userId);
    return;
  }
  const patch: Record<string, unknown> = { needs_clarification: false, updated_at: now };
  if (kind === "color") patch.color = answer;
  else if (kind === "material") patch.material = answer;
  else if (kind === "brand") {
    patch.brand = answer;
    patch.source = answer;
  }
  await supabase.from("wardrobe_items").update(patch).eq("id", itemId).eq("user_id", userId);
}

function num(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}
function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}
