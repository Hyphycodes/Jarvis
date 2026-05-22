"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { recordBehaviorSignal } from "@/lib/memory/behaviorSignals";

export async function setPlanLive(input: {
  planId: string;
  enabled: boolean;
}): Promise<{ ok: true; enabled: boolean }> {
  const owner = await requireOwner();
  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("plans")
    .update({
      live_enabled: input.enabled,
      live_label: input.enabled ? "LIVE" : "BEGIN",
    })
    .eq("id", input.planId)
    .eq("user_id", owner.id);
  if (error) throw new Error(error.message);

  await recordBehaviorSignal(
    input.enabled
      ? { type: "plan.activate", planId: input.planId }
      : { type: "plan.cancel", planId: input.planId },
  );

  revalidatePath("/");
  revalidatePath(`/active/sparrow`);
  revalidatePath(`/plan/sparrow`);
  return { ok: true, enabled: input.enabled };
}

export async function completeTimelineItem(input: {
  timelineItemId: string;
}): Promise<{ ok: true }> {
  const owner = await requireOwner();
  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("today_timeline_items")
    .update({ status: "done" })
    .eq("id", input.timelineItemId)
    .eq("user_id", owner.id);
  if (error) throw new Error(error.message);

  await recordBehaviorSignal({
    type: "timeline.complete",
    itemId: input.timelineItemId,
  });

  revalidatePath("/");
  return { ok: true };
}
