import "server-only";

import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { readBriefingFromPayload } from "@/lib/brain/briefingTypes";
import { scoreSourceTrust } from "@/lib/intelligence/sourceTrust";
import type { SurfacedItemRow } from "@/lib/types/database";

const PROTECTED = new Set(["saved", "planned", "completed", "archived"]);
const BAD_FLAGS = new Set([
  "instagram_noise",
  "social_noise",
  "raw_comment",
  "too_literal",
  "weak_evidence",
  "seo_junk",
  "closed_event",
  "expired_event",
  "directory_spam",
  "misclassified",
  "title_unclear",
  "no_clear_move",
]);

export type RadarCleanupResult = {
  ok: boolean;
  reviewed: number;
  archived: number;
  moved_to_holding: number;
  duplicates: number;
  preserved: number;
  reasons: string[];
};

export async function cleanupRadar(userId: string): Promise<RadarCleanupResult> {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("surfaced_items")
    .select("*")
    .eq("user_id", userId)
    .eq("destination", "radar")
    .in("status", ["shown", "discovered"])
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as SurfacedItemRow[];
  const seen = new Set<string>();
  const reasons: string[] = [];
  let archived = 0;
  let moved = 0;
  let duplicates = 0;
  let preserved = 0;

  for (const row of rows) {
    if (PROTECTED.has(row.status)) {
      preserved++;
      continue;
    }
    const briefing = readBriefingFromPayload(row.payload);
    const trust = scoreSourceTrust({
      url: row.url ?? undefined,
      title: row.title ?? undefined,
      snippet: row.description ?? undefined,
      publishedDate: readString(row.payload, "published_date"),
      age: readString(row.payload, "age"),
    });
    const key = duplicateKey(row);
    const isDuplicate = seen.has(key);
    seen.add(key);
    const flags = new Set([
      ...(briefing?.quality_flags ?? []),
      ...trust.qualityFlags,
      ...flagTitle(row.title ?? ""),
    ]);
    const badFlagCount = Array.from(flags).filter((flag) => BAD_FLAGS.has(flag)).length;
    const reason = Array.from(flags).join(", ") || "low source trust";

    if (isDuplicate || badFlagCount >= 2 || trust.trustScore < 0.28) {
      const { error: updateError } = await supabase
        .from("surfaced_items")
        .update({ status: "archived" })
        .eq("id", row.id)
        .eq("user_id", userId);
      if (!updateError) {
        archived++;
        if (isDuplicate) duplicates++;
        reasons.push(`${row.title}: archived (${isDuplicate ? "duplicate" : reason})`);
      }
      continue;
    }

    if (badFlagCount === 1 || briefing?.best_next_action === "research") {
      const { error: updateError } = await supabase
        .from("surfaced_items")
        .update({ destination: "holding", status: "discovered" })
        .eq("id", row.id)
        .eq("user_id", userId);
      if (!updateError) {
        moved++;
        reasons.push(`${row.title}: moved to Holding (${reason})`);
      }
      continue;
    }

    preserved++;
  }

  return {
    ok: true,
    reviewed: rows.length,
    archived,
    moved_to_holding: moved,
    duplicates,
    preserved,
    reasons: reasons.slice(0, 20),
  };
}

function duplicateKey(row: SurfacedItemRow): string {
  return [
    row.url ?? "",
    row.source_id ?? "",
    (row.title ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
  ]
    .filter(Boolean)
    .join("|");
}

function flagTitle(title: string): string[] {
  const flags: string[] = [];
  if (/#\w+|view all \d+ comments|profile|local-radar|seed:|query:/i.test(title)) {
    flags.push("title_unclear");
  }
  if (/rugged masculine|quiet luxury/i.test(title)) flags.push("too_literal");
  return flags;
}

function readString(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const found = (value as Record<string, unknown>)[key];
  return typeof found === "string" ? found : undefined;
}
