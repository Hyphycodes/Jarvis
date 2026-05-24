import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { loadPlanBriefBySlug } from "@/lib/plans/loadBrief";
import {
  PlanChapterRow,
  PlanHero,
  PlanInfoStrip,
  PlanPrimaryButton,
  PlanQuoteCard,
  PlanShell,
  PlanTopBar,
} from "@/components/plan";
import { categoryLabel } from "@/lib/plans/planCopyBanks";

export const metadata = { title: "Plan · Jarvis" };
export const dynamic = "force-dynamic";

export default async function DynamicPlanPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=/plan/${encodeURIComponent(slug)}`);

  const brief = await loadPlanBriefBySlug(slug);
  if (!brief) notFound();

  const backHref = brief.sourceId ? `/item/${brief.sourceId}` : "/";

  return (
    <PlanShell>
      <PlanTopBar
        backHref={backHref}
        eyebrowDate={brief.dateLabel?.toUpperCase()}
      />

      <PlanHero
        image={brief.heroImage}
        categoryLabel={categoryLabel(brief.category)}
        title={brief.title}
        meta={[brief.areaLabel ?? brief.locationLabel, brief.timeLabel]}
        summary={brief.summary}
        primary={
          <PlanPrimaryButton state={brief.state} planId={brief.planId} />
        }
      />

      <PlanInfoStrip blocks={brief.infoStrip} />

      <nav aria-label="Plan chapters" className="mt-2">
        {brief.chapters.map((chapter) => (
          <PlanChapterRow key={chapter.key} chapter={chapter} />
        ))}
      </nav>

      <PlanQuoteCard
        body={brief.quote.body}
        attribution={brief.quote.attribution}
      />
    </PlanShell>
  );
}
