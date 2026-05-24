import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { loadPlanBriefBySlug } from "@/lib/plans/loadBrief";
import {
  PlanDivider,
  PlanPrimaryButton,
  PlanSectionHeader,
  PlanShell,
  PlanTimeline,
  PlanTopBar,
} from "@/components/plan";

export const metadata = { title: "The Move · Plan · Jarvis" };
export const dynamic = "force-dynamic";

export default async function PlanMovePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await getSessionUser();
  if (!user)
    redirect(`/login?next=/plan/${encodeURIComponent(slug)}/move`);

  const brief = await loadPlanBriefBySlug(slug);
  if (!brief) notFound();

  return (
    <PlanShell>
      <PlanTopBar
        backHref={`/plan/${slug}`}
        eyebrowCenter="THE MOVE"
        showShare
        showMore
      />

      <PlanSectionHeader
        title="The flow of the night."
        subtitle="Six moments. One evening. Move slowly — let it breathe."
        meta={[brief.title, brief.dateLabel, brief.timeLabel]}
      />

      <PlanTimeline items={brief.move.items} />

      <PlanDivider variant="full" className="mt-10" />

      <ClosingLine>
        {brief.move.closing ??
          "This is the shape of the night. Don't follow it — let it carry you."}
      </ClosingLine>

      <div className="mt-10 px-5">
        <PlanPrimaryButton
          state={brief.state}
          planId={brief.planId}
          labelOverride={brief.state === "live" ? undefined : "Begin Evening"}
        />
      </div>
    </PlanShell>
  );
}

function ClosingLine({ children }: { children: ReactNode }) {
  return (
    <p
      className="mt-10 px-5 text-center font-serif italic"
      style={{
        color: "var(--text-muted)",
        fontSize: "17px",
        lineHeight: 1.5,
      }}
    >
      {children}
    </p>
  );
}
