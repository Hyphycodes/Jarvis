/**
 * GET /api/plans/[id]/ics
 *
 * Phase 9: export a scheduled plan as a .ics VEVENT the user can import into
 * Apple/Google Calendar (the app is a PWA with no native-calendar access).
 */

import { z } from "zod";
import { getViewableProfileId } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import type { Json } from "@/lib/types/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.string().uuid() });

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = paramsSchema.parse(await ctx.params);
  const { id: userId } = await getViewableProfileId();
  if (!userId) return new Response("UNAUTHENTICATED", { status: 401 });

  const supabase = await getServerSupabase();
  const { data } = await supabase
    .from("plans")
    .select("title,location_line,scheduled_date,scheduled_time,key_stats")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return new Response("Not found", { status: 404 });

  const plan = data as {
    title: string;
    location_line: string | null;
    scheduled_date: string | null;
    scheduled_time: string | null;
    key_stats: Json;
  };

  // Fixed (event) plans carry the exact official instant in key_stats.starts_at —
  // use it directly so the calendar entry is timezone-accurate. Flexible plans
  // reconstruct from the picked scheduled_date/time.
  const fixedStart = readStartsAt(plan.key_stats);
  if (!fixedStart && !plan.scheduled_date) {
    return new Response("Plan is not scheduled yet", { status: 409 });
  }

  const start = fixedStart
    ? new Date(fixedStart)
    : new Date(`${plan.scheduled_date}T${plan.scheduled_time ?? "19:00"}:00`);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000); // default 2h block
  const address = readAddress(plan.key_stats) ?? plan.location_line ?? "";

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Jarvis//Plan//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${id}@jarvis`,
    `DTSTAMP:${toIcsUtc(new Date())}`,
    `DTSTART:${toIcsUtc(start)}`,
    `DTEND:${toIcsUtc(end)}`,
    `SUMMARY:${escapeIcs(plan.title)}`,
    address ? `LOCATION:${escapeIcs(address)}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");

  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slugFilename(plan.title)}.ics"`,
    },
  });
}

function toIcsUtc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeIcs(value: string): string {
  return value.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
}

function slugFilename(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "plan";
}

function readAddress(keyStats: Json): string | null {
  if (typeof keyStats !== "object" || keyStats === null || Array.isArray(keyStats)) {
    return null;
  }
  const value = (keyStats as Record<string, unknown>).address;
  return typeof value === "string" ? value : null;
}

function readStartsAt(keyStats: Json): string | null {
  if (typeof keyStats !== "object" || keyStats === null || Array.isArray(keyStats)) {
    return null;
  }
  const value = (keyStats as Record<string, unknown>).starts_at;
  if (typeof value !== "string") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : value;
}
