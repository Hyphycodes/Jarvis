import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { loadPlanBriefBySlug } from "@/lib/plans/loadBrief";
import {
  PlanDivider,
  PlanSectionHeader,
  PlanShell,
  PlanTopBar,
} from "@/components/plan";
import { chapterCopy } from "@/lib/plans/planCopyBanks";
import type { PlanChapterKey, PlanLightSection } from "@/lib/plans/planBrief";

/**
 * LightChapter — shared scaffold used by /atmosphere /details /detours
 * /after. Light on content, premium in feel — same shell, typography,
 * dividers, and quote/callout language as /before and /move.
 *
 * Always renders the full structure:
 *   top bar → eyebrow → italic title → italic subtitle → meta line →
 *   body paragraph → optional bullets → divider → confirmation line →
 *   closing line.
 *
 * Never blank. Never raw. The copy banks (`planCopyBanks.ts`) supply
 * fallback strings when no real section data exists.
 */
export async function renderLightChapter({
  params,
  chapterKey,
}: {
  params: Promise<{ slug: string }>;
  chapterKey: PlanChapterKey;
}): Promise<ReactNode> {
  const { slug } = await params;
  const user = await getSessionUser();
  if (!user)
    redirect(`/login?next=/plan/${encodeURIComponent(slug)}/${chapterKey}`);

  const brief = await loadPlanBriefBySlug(slug);
  if (!brief) notFound();

  const copy = chapterCopy(chapterKey);
  const section: PlanLightSection =
    chapterKey === "atmosphere"
      ? brief.atmosphere
      : chapterKey === "details"
        ? brief.details
        : chapterKey === "detours"
          ? brief.detours
          : brief.after;

  return (
    <PlanShell>
      <PlanTopBar
        backHref={`/plan/${slug}`}
        eyebrowCenter={copy.eyebrow}
        showShare
        showMore
      />

      <PlanSectionHeader
        title={copy.title}
        subtitle={copy.subtitle}
        meta={[brief.title, brief.dateLabel, brief.timeLabel]}
      />

      <section className="mt-10 px-5">
        <p
          className="font-serif italic"
          style={{
            color: section.fallback ? "var(--text-muted)" : "var(--text-primary)",
            fontSize: "17px",
            lineHeight: 1.55,
          }}
        >
          {section.body}
        </p>

        {section.bullets && section.bullets.length > 0 ? (
          <ul className="mt-5 flex flex-col gap-3">
            {section.bullets.map((b, i) => (
              <li
                key={`${b}-${i}`}
                className="grid grid-cols-[14px_minmax(0,1fr)] items-start gap-3"
              >
                <span
                  aria-hidden
                  className="mt-3 block h-px w-3"
                  style={{ background: "var(--gold-dim)" }}
                />
                <p
                  className="font-serif italic"
                  style={{
                    color: "var(--text-primary)",
                    fontSize: "15px",
                    lineHeight: 1.5,
                  }}
                >
                  {b}
                </p>
              </li>
            ))}
          </ul>
        ) : null}

        <PlanDivider variant="inset" className="mx-0 my-8" />

        <p
          className="font-serif italic"
          style={{
            color: "var(--gold-soft)",
            fontSize: "14px",
            lineHeight: 1.5,
          }}
        >
          {section.confirmation}
        </p>
      </section>

      <p
        className="mt-12 px-5 text-center font-serif italic"
        style={{
          color: "var(--text-muted)",
          fontSize: "17px",
          lineHeight: 1.5,
        }}
      >
        {section.closing}
      </p>
    </PlanShell>
  );
}
