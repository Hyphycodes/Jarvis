/**
 * GET /api/plans/refresh-today  (cron, daily ~6:30am Chicago + midday)
 *
 * Plans stay alive: a plan built Tuesday for Saturday re-checks itself the
 * morning it matters. For every ready plan whose start is today, refresh the
 * live weather against the plan's own coordinates (fallback: the source
 * item's) and stamp key_stats.day_of with what changed. Confidence has to
 * survive contact with the real world at the moment it matters.
 */

import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { getCurrentWeather } from "@/lib/sources/openMeteo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const CHICAGO_TZ = "America/Chicago";

function validateCronSecret(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function chicagoDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: CHICAGO_TZ });
}

/** Coarse weather family from the Open-Meteo code — enough to detect a flip. */
function weatherFamily(code: number): "clear" | "cloudy" | "rain" | "snow" | "storm" {
  if (code === 0 || code === 1) return "clear";
  if (code >= 95) return "storm";
  if (code >= 71 && code <= 86) return "snow";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  return "cloudy";
}

export async function GET(req: Request) {
  if (!validateCronSecret(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  const supabase = getSupabaseServiceClient();
  const today = chicagoDay(new Date().toISOString());

  const { data, error } = await supabase
    .from("plans")
    .select("id, user_id, key_stats, build_status")
    .eq("build_status", "ready")
    .limit(400);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  let checked = 0;
  let flagged = 0;
  const errors: string[] = [];

  for (const plan of (data ?? []) as Array<{ id: string; user_id: string; key_stats: unknown }>) {
    const ks = isRecord(plan.key_stats) ? plan.key_stats : {};
    const startsAt = typeof ks.starts_at === "string" ? ks.starts_at : null;
    if (!startsAt || chicagoDay(startsAt) !== today) continue;

    // Resolve coordinates: the plan's own, else its source item's.
    let lat = typeof ks.lat === "number" ? ks.lat : null;
    let lng = typeof ks.lng === "number" ? ks.lng : null;
    if (lat === null || lng === null) {
      const sourceItemId = typeof ks.source_item_id === "string" ? ks.source_item_id : null;
      if (sourceItemId) {
        const { data: item } = await supabase
          .from("surfaced_items")
          .select("lat, lng")
          .eq("id", sourceItemId)
          .eq("user_id", plan.user_id)
          .maybeSingle();
        lat = typeof item?.lat === "number" ? item.lat : null;
        lng = typeof item?.lng === "number" ? item.lng : null;
      }
    }
    if (lat === null || lng === null) continue; // nothing real to check against

    try {
      const now = await getCurrentWeather({ lat, lng });
      const builtWeather = isRecord(ks.weather) ? ks.weather : null;
      const builtCode =
        builtWeather && typeof builtWeather.weatherCode === "number"
          ? builtWeather.weatherCode
          : null;
      const shifted =
        builtCode !== null && weatherFamily(builtCode) !== weatherFamily(now.weatherCode);

      const dayOf: Record<string, unknown> = {
        checked_at: new Date().toISOString(),
        weather: {
          temperatureF: now.temperatureF,
          windMph: now.windMph,
          weatherCode: now.weatherCode,
        },
      };
      if (shifted) {
        dayOf.note = `Conditions shifted since this was planned — now ${weatherFamily(now.weatherCode)} (${Math.round(now.temperatureF)}°F). Re-check the outdoor pieces.`;
        flagged += 1;
      }

      const { error: upErr } = await supabase
        .from("plans")
        .update({ key_stats: { ...ks, day_of: dayOf } })
        .eq("id", plan.id)
        .eq("user_id", plan.user_id);
      if (upErr) errors.push(`${plan.id}: ${upErr.message}`);
      else checked += 1;
    } catch (err) {
      errors.push(`${plan.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({ ok: true, today, checked, flagged, errors });
}

export const POST = GET;
