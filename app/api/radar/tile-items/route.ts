import { NextResponse } from "next/server";
import { getViewableProfileId } from "@/lib/auth";
import {
  RADAR_CATEGORY_COPY,
  type GlanceTileKey,
  type RadarFilterKey,
} from "@/lib/radar/categoryCopy";
import {
  collectRadarPageInputs,
  selectTileItems,
  toListEntry,
} from "@/lib/radar/categoryPages";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Items behind a single at-a-glance stat tile, scoped to one category filter.
 * Uses the exact same predicates as the loader that produced the count, so the
 * sheet list always matches the number on the tile.
 */
export async function GET(request: Request) {
  try {
    const { id } = await getViewableProfileId();
    if (!id) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }

    const url = new URL(request.url);
    const filter = url.searchParams.get("filter") as RadarFilterKey | null;
    const tile = url.searchParams.get("tile") as GlanceTileKey | null;
    const copy = filter ? RADAR_CATEGORY_COPY[filter] : undefined;
    const tileDef = copy?.tiles.find((t) => t.key === tile);
    if (!copy || !tileDef || !filter || !tile) {
      return NextResponse.json({ error: "Unknown filter or tile." }, { status: 400 });
    }

    const inputs = await collectRadarPageInputs();
    const items = selectTileItems(inputs, filter, tile);
    const dated = tile === "confirmed" || tile === "reservations" || tile === "upcoming" || tile === "thisWeek" || tile === "thisMonth";
    const startTime = (iso?: string) => {
      const t = Date.parse(iso ?? "");
      return Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER;
    };
    const sorted = [...items].sort((a, b) =>
      dated
        ? startTime(a.startsAt) - startTime(b.startsAt)
        : Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
    );
    return NextResponse.json({
      ok: true,
      label: tileDef.label,
      count: sorted.length,
      items: sorted.slice(0, 40).map((item) => toListEntry(item, inputs.plansById)),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
