import "server-only";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Scans circle_updates for birthday/occasion signals, calculates days-out,
 * and upserts enriched urgency + suggested_action back so Today surfaces them
 * with the right context. Called from daily_maintenance cron.
 */
export async function runOccasionEngine(
  userId: string,
  supabase?: SupabaseClient,
): Promise<{ detected: number; enriched: number }> {
  const db = supabase ?? getSupabaseServiceClient();
  let detected = 0;
  let enriched = 0;

  try {
    const { data: updates } = await db
      .from("circle_updates")
      .select("id, person_id, title, summary, suggested_action, urgency, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!updates?.length) return { detected, enriched };

    const MONTH_MAP: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    };

    for (const update of updates) {
      const title = (update.title as string).toLowerCase();
      const isOccasion =
        title.includes("birthday") ||
        title.includes("party") ||
        title.includes("anniversary") ||
        title.includes("graduation") ||
        title.includes("wedding") ||
        title.includes("milestone");

      if (!isOccasion) continue;
      detected++;

      const occasionType =
        title.includes("birthday") ? "birthday"
        : title.includes("party") ? "party"
        : "milestone";

      // Parse days-out from title patterns like "(June 12)" or "June 12"
      let daysOut: number | null = null;
      const dateMatch = (update.title as string).match(
        /\(?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\)?/i,
      );
      if (dateMatch) {
        const month = MONTH_MAP[dateMatch[1].toLowerCase().slice(0, 3)];
        const day = parseInt(dateMatch[2], 10);
        if (month !== undefined && !isNaN(day)) {
          const now = new Date();
          const eventDate = new Date(now.getFullYear(), month, day);
          if (eventDate < now) eventDate.setFullYear(now.getFullYear() + 1);
          daysOut = Math.ceil(
            (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
          );
        }
      }

      const urgency =
        daysOut !== null && daysOut <= 7 ? "high"
        : daysOut !== null && daysOut <= 14 ? "medium"
        : (update.urgency as string) === "high" ? "high"
        : "medium"; // escalate occasions to at least medium

      const noun = occasionType === "birthday" ? "Birthday" : "Occasion";
      const suggested_action =
        daysOut !== null
          ? `${noun} in ${daysOut} day${daysOut === 1 ? "" : "s"}. Build a plan or get a gift.`
          : `Upcoming ${occasionType}. Build a plan or send something.`;

      const { error } = await db
        .from("circle_updates")
        .update({ urgency, suggested_action })
        .eq("id", update.id as string)
        .eq("user_id", userId);
      if (error) {
        console.warn("[occasionEngine] update failed", update.id, error.message);
      } else {
        enriched++;
      }
    }
  } catch (err) {
    console.error("[occasionEngine] run failed", err);
  }

  return { detected, enriched };
}
