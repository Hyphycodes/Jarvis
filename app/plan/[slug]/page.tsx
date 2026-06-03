import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { loadPlanBriefBySlug } from "@/lib/plans/loadBrief";
import { loadPlanBySlugV2 } from "@/lib/plans/loadPlan";
import { enrichInfoStrip } from "@/lib/plans/enrichLogistics";
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
import { dateKey } from "@/components/calendar/MonthGrid";

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

  // Enrich the info strip with real weather / in-the-area data when available.
  // Sample plans (no planId) skip enrichment — keep their designed fallbacks.
  let infoStrip = brief.infoStrip;
  if (brief.planId) {
    const loaded = await loadPlanBySlugV2(slug);
    if (loaded) infoStrip = await enrichInfoStrip(brief, loaded);
  }

  const backHref = brief.sourceId ? `/item/${brief.sourceId}` : "/";
  const isBuilding = brief.buildStatus === "building";
  const isDayOf = Boolean(
    brief.scheduledDate && brief.scheduledDate === dateKey(new Date()),
  );

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
          isDayOf ? (
            <PlanPrimaryButton state={brief.state} planId={brief.planId} />
          ) : undefined
        }
      />

      {isBuilding ? (
        <div className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-2.5 text-[11px] uppercase tracking-[0.18em] text-warm-ivory/55">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#D4AF53]" />
          Plan building…
        </div>
      ) : null}

      <PlanInfoStrip blocks={infoStrip} />

      <nav aria-label="Plan chapters" className="mt-2">
        {brief.chapters.map((chapter) => (
          <PlanChapterRow key={chapter.key} chapter={chapter} />
        ))}
      </nav>

      {brief.scheduledDate ? (
        <div className="mt-4 flex justify-center">
          <a
            href={`/api/plans/${brief.planId}/ics`}
            className="text-[11px] uppercase tracking-[0.18em] text-[#D4AF53]/80 transition-colors hover:text-[#D4AF53]"
          >
            Add to Apple / Google Calendar
          </a>
        </div>
      ) : null}

      <PlanQuoteCard
        body={brief.quote.body}
        attribution={brief.quote.attribution}
      />
    </PlanShell>
  );
}
