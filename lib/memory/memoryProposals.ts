import { randomUUID } from "node:crypto";
import { requireOwner } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import type { MemoryUpdateProposal, MemoryType } from "@/lib/memory/types";
import { createCanonicalMemory } from "@/lib/memory/memoryStore";
import type { MemoryUpdateProposalRow } from "@/lib/types/database";

export async function createMemoryProposal(input: {
  userId: string;
  type: MemoryType;
  content: string;
  confidence: number;
  shouldSave: boolean;
  reason: string;
  evidence: string[];
  requiresUserApproval?: boolean;
}): Promise<MemoryUpdateProposal> {
  const proposal: MemoryUpdateProposal = {
    id: randomUUID(),
    type: input.type,
    content: input.content,
    confidence: input.confidence,
    shouldSave: input.shouldSave,
    reason: input.reason,
    evidence: input.evidence,
    requiresUserApproval: input.requiresUserApproval ?? true,
  };

  const supabase = await getServerSupabase();
  const { error } = await supabase.from("memory_update_proposals").insert({
    id: proposal.id,
    user_id: input.userId,
    memory_type: proposal.type,
    content: proposal.content,
    confidence: proposal.confidence,
    should_save: proposal.shouldSave,
    reason: proposal.reason,
    evidence: proposal.evidence,
    requires_user_approval: proposal.requiresUserApproval,
    status: "pending",
  });
  if (error) throw new Error(error.message);
  return proposal;
}

export async function listPendingMemoryProposals(): Promise<MemoryUpdateProposal[]> {
  const owner = await requireOwner();
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("memory_update_proposals")
    .select("*")
    .eq("user_id", owner.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as MemoryUpdateProposalRow[]).map(toMemoryUpdateProposal);
}

export async function decideMemoryProposal(input: {
  id: string;
  action: "accept" | "reject" | "archive";
}): Promise<void> {
  const owner = await requireOwner();
  const supabase = await getServerSupabase();
  const { data: proposal, error: readError } = await supabase
    .from("memory_update_proposals")
    .select("*")
    .eq("id", input.id)
    .eq("user_id", owner.id)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!proposal) throw new Error("Memory proposal not found.");

  if (input.action === "accept") {
    await createCanonicalMemory({
      type: proposal.memory_type,
      content: proposal.content,
      confidence: Number(proposal.confidence),
      source: "explicit",
      tags: proposal.evidence ?? [],
      metadata: { proposalId: proposal.id, reason: proposal.reason },
    });
  }

  const nextStatus =
    input.action === "accept"
      ? "accepted"
      : input.action === "archive"
        ? "archived"
        : "rejected";

  const { error: updateError } = await supabase
    .from("memory_update_proposals")
    .update({
      status: nextStatus,
      decided_at: new Date().toISOString(),
    })
    .eq("id", input.id)
    .eq("user_id", owner.id);
  if (updateError) throw new Error(updateError.message);
}

export function toMemoryUpdateProposal(
  row: MemoryUpdateProposalRow,
): MemoryUpdateProposal {
  return {
    id: row.id,
    type: row.memory_type,
    content: row.content,
    confidence: Number(row.confidence),
    shouldSave: row.should_save,
    reason: row.reason,
    evidence: row.evidence ?? [],
    requiresUserApproval: row.requires_user_approval,
  };
}
