import "server-only";

import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { recordAiAction } from "@/lib/chat/aiActions";
import { recordChatBehaviorSignal } from "@/lib/chat/behaviorSignals";

export async function learnSource(input: {
  userId: string;
  observationId?: string | null;
  name: string;
  instagramHandle?: string | null;
  url?: string | null;
  notes?: string | null;
  userConfirmed?: boolean;
}): Promise<{ sourceId: string; reused: boolean }> {
  const handle = normalizeHandle(input.instagramHandle ?? handleFromUrl(input.url) ?? input.name);
  const supabase = await getServerSupabase();

  const { data: existing } = await supabase
    .from("tastemakers")
    .select("id")
    .eq("user_id", input.userId)
    .eq("instagram_handle", handle)
    .maybeSingle();

  if (existing?.id) {
    return { sourceId: existing.id, reused: true };
  }

  const { data, error } = await supabase
    .from("tastemakers")
    .insert({
      user_id: input.userId,
      name: input.name,
      role: "curator",
      notes: input.notes ?? "Learned from Phase 10 multimodal intake.",
      instagram_handle: handle,
      website_url: input.url ?? (handle ? `https://www.instagram.com/${handle}/` : null),
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Source insert failed");

  const sourceId = (data as { id: string }).id;
  await recordAiAction({
    userId: input.userId,
    actionType: "monitor_source",
    inputObservationId: input.observationId ?? null,
    targetTable: "tastemakers",
    targetId: sourceId,
    confidence: 0.8,
    reasoningSummary: `Learned source ${input.name}.`,
    wasUserConfirmed: input.userConfirmed ?? false,
    stateAfter: "saved_to_radar",
  });
  await recordChatBehaviorSignal({
    userId: input.userId,
    signalType: "source_followed",
    objectType: "source",
    objectId: sourceId,
    metadata: { handle, name: input.name },
  });

  return { sourceId, reused: false };
}

function normalizeHandle(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().replace(/^@/, "");
  return trimmed ? trimmed.toLowerCase() : null;
}

function handleFromUrl(url: string | null | undefined) {
  if (!url) return null;
  const match = url.match(/instagram\.com\/([^/?#]+)/i);
  return match?.[1] ?? null;
}
