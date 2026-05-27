import { loadPlanBySlug } from "@/lib/dispatch/loadSurface";
import { SparrowPlanClient } from "./SparrowPlanClient";

export const dynamic = "force-dynamic";

export default async function SparrowPlanPage() {
  const plan = await loadPlanBySlug("Sparrow");
  return (
    <SparrowPlanClient
      planId={plan?.id ?? null}
      initialLive={plan?.liveState.enabled ?? false}
      dateLabel={plan?.date ?? "Tonight"}
    />
  );
}
