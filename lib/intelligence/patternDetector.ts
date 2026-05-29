import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createMemoryProposal } from "@/lib/memory/memoryProposals";

export async function detectAndProposePatterns(
  userId: string,
  supabase: SupabaseClient,
): Promise<{ proposals_created: number }> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  let proposals_created = 0;

  try {
    // Fetch recently passed and completed items (last 30 days)
    const { data: recentItems } = await supabase
      .from("surfaced_items")
      .select("id, status, occasion_type, title, location_name, updated_at")
      .eq("user_id", userId)
      .gte("updated_at", thirtyDaysAgo)
      .in("status", ["passed", "completed", "planned"]);

    if (!recentItems || recentItems.length === 0) return { proposals_created };

    type Row = {
      id: string;
      status: string;
      occasion_type: string | null;
      title: string | null;
      location_name: string | null;
      updated_at: string;
    };

    const rows = recentItems as Row[];

    // Fetch existing pending/rejected proposals to avoid duplicates
    const { data: existingProposals } = await supabase
      .from("memory_update_proposals")
      .select("content, status, created_at")
      .eq("user_id", userId)
      .in("status", ["pending", "rejected"])
      .gte("created_at", sixtyDaysAgo);

    const recentProposalContents = new Set(
      ((existingProposals ?? []) as Array<{ content: string; status: string; created_at: string }>)
        .map((p) => p.content.toLowerCase()),
    );

    function alreadyProposed(key: string): boolean {
      return Array.from(recentProposalContents).some((c) => c.includes(key.toLowerCase()));
    }

    // ── Pattern 1: 3+ passes on same occasion_type ──────────────────────────
    const passByOccasion = groupAndCount(
      rows.filter((r) => r.status === "passed" && r.occasion_type),
      (r) => r.occasion_type!,
    );
    for (const [occasionType, count] of Object.entries(passByOccasion)) {
      if (count >= 3 && !alreadyProposed(occasionType)) {
        await safeCreateProposal(userId, {
          type: "avoidance",
          content: `Consider demoting ${occasionType.replace(/_/g, " ")} recommendations — passed 3+ times in 30 days`,
          confidence: 0.72,
          shouldSave: false,
          reason: `${count} passes on ${occasionType} items in the last 30 days suggests low interest in this occasion type`,
          evidence: [`${count} passes`, "30-day window", occasionType],
        });
        proposals_created++;
      }
    }

    // ── Pattern 2: 3+ completions on same occasion_type ─────────────────────
    const completedByOccasion = groupAndCount(
      rows.filter((r) => (r.status === "completed" || r.status === "planned") && r.occasion_type),
      (r) => r.occasion_type!,
    );
    for (const [occasionType, count] of Object.entries(completedByOccasion)) {
      if (count >= 3 && !alreadyProposed(`elevate ${occasionType}`)) {
        await safeCreateProposal(userId, {
          type: "confirmed_behavior",
          content: `Consider elevating ${occasionType.replace(/_/g, " ")} recommendations — completed 3+ times`,
          confidence: 0.78,
          shouldSave: true,
          reason: `${count} completions on ${occasionType} items suggests strong interest in this occasion type`,
          evidence: [`${count} completions`, "30-day window", occasionType],
        });
        proposals_created++;
      }
    }

    // ── Pattern 3: 3+ passes on same place ──────────────────────────────────
    const passByPlace = groupAndCount(
      rows.filter((r) => r.status === "passed" && (r.location_name ?? r.title)),
      (r) => (r.location_name ?? r.title)!,
    );
    for (const [placeName, count] of Object.entries(passByPlace)) {
      if (count >= 3 && !alreadyProposed(`archive ${placeName}`)) {
        await safeCreateProposal(userId, {
          type: "place_history",
          content: `Consider archiving library entry for "${placeName}" — passed 3+ times`,
          confidence: 0.8,
          shouldSave: false,
          reason: `"${placeName}" has been passed ${count} times — unlikely to be acted on`,
          evidence: [`${count} passes`, placeName, "30-day window"],
        });
        proposals_created++;
      }
    }
  } catch (err) {
    console.error("[patternDetector] failed", err);
  }

  return { proposals_created };
}

async function safeCreateProposal(
  userId: string,
  proposal: {
    type: "taste" | "avoidance" | "confirmed_behavior" | "place_history";
    content: string;
    confidence: number;
    shouldSave: boolean;
    reason: string;
    evidence: string[];
  },
): Promise<void> {
  try {
    await createMemoryProposal({
      userId,
      type: proposal.type,
      content: proposal.content,
      confidence: proposal.confidence,
      shouldSave: proposal.shouldSave,
      reason: proposal.reason,
      evidence: proposal.evidence,
      requiresUserApproval: true,
    });
  } catch (err) {
    console.error("[patternDetector] createMemoryProposal failed", err);
  }
}

function groupAndCount<T>(
  rows: T[],
  key: (row: T) => string,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const k = key(row);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}
