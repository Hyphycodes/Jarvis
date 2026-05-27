import { loadPlanBySlug } from "@/lib/dispatch/loadSurface";
import { SparrowActiveClient } from "./SparrowActiveClient";

export const dynamic = "force-dynamic";

export default async function SparrowActivePage() {
  const plan = await loadPlanBySlug("Sparrow");
  return (
    <SparrowActiveClient
      planId={plan?.id ?? null}
      dateLabel={plan?.date ?? "Tonight"}
    />
  );
}
