import { renderLightChapter } from "../_LightChapter";
import { getExperienceMemory } from "@/lib/actions/experienceMemory";
import { ExperienceCapture } from "@/components/plan/ExperienceCapture";
import type { PlanBrief } from "@/lib/plans/planBrief";

export const metadata = { title: "After · Plan · Jarvis" };
export const dynamic = "force-dynamic";

export default async function PlanAfterPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return renderLightChapter({
    params,
    chapterKey: "after",
    renderFooter: (brief) => <AfterExperienceSection brief={brief} />,
  });
}

/** The Experience capture — only once the plan is live or completed (a recently
 *  completed plan is in the 'after' state). Never shown for future plans. */
async function AfterExperienceSection({ brief }: { brief: PlanBrief }) {
  if (!brief.planId) return null;
  if (brief.state !== "live" && brief.state !== "after") return null;
  const existing = await getExperienceMemory({ planId: brief.planId });
  return (
    <ExperienceCapture planId={brief.planId} venueName={brief.title} existing={existing} />
  );
}
