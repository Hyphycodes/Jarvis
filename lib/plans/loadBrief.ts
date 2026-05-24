/**
 * Shared loader used by every /plan/[slug]/* route — resolves a slug to
 * a PlanBrief (with sample-mode fallback) or returns null when the slug
 * has no matching plan.
 */

import "server-only";

import { loadPlanBySlugV2 } from "@/lib/plans/loadPlan";
import { buildPlanBrief } from "@/lib/plans/buildPlanBrief";
import { samplePlanBrief } from "@/lib/plans/samplePlanBrief";
import type { PlanBrief } from "@/lib/plans/planBrief";

export async function loadPlanBriefBySlug(
  slug: string,
): Promise<PlanBrief | null> {
  // Sample slug — always returns the design fallback. Useful for QA and
  // for the system to never feel broken when there are no real plans yet.
  if (slug === "sample") {
    return samplePlanBrief();
  }

  const loaded = await loadPlanBySlugV2(slug);
  if (!loaded) return null;

  return buildPlanBrief({ loaded });
}
