import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import type { Json, SurfacedItemRow } from "@/lib/types/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const owner = await requireOwner();
    const supabase = await getServerSupabase();
    const { data, error, count } = await supabase
      .from("surfaced_items")
      .select("*", { count: "exact" })
      .eq("user_id", owner.id)
      .eq("destination", "holding")
      .in("status", ["discovered", "shown"])
      .order("updated_at", { ascending: false })
      .limit(30);

    if (error) throw new Error(error.message);

    const items = ((data ?? []) as SurfacedItemRow[]).map((row) => ({
      id: row.id,
      category: (row.category ?? row.type ?? "item").toUpperCase(),
      title: row.title ?? "Untitled",
      body:
        row.description ??
        row.subtitle ??
        row.reasons?.find((reason) => Boolean(reason)) ??
        "Held for later.",
      meta: [formatMeta(row.starts_at), row.location_name, row.subtitle].filter(
        (value): value is string => Boolean(value),
      ),
      footerLine: [
        typeof row.score === "number" ? `Score ${Math.round(row.score * 100)}` : null,
        row.source,
      ]
        .filter(Boolean)
        .join(" · "),
      imageUrl: row.image_url ?? undefined,
      planSlug: readPlanSlug(row.payload),
    }));

    return NextResponse.json({ ok: true, count: count ?? items.length, items });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "UNAUTHENTICATED") {
        return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Unknown error" }, { status: 500 });
  }
}

function formatMeta(iso?: string | null): string | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  return date
    .toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
    .toUpperCase();
}

function readPlanSlug(payload: Json): string | undefined {
  if (!isRecord(payload)) return undefined;
  return typeof payload.plan_slug === "string" ? payload.plan_slug : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
