import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { loadPlanBriefBySlug } from "@/lib/plans/loadBrief";
import {
  PlanChecklist,
  PlanDivider,
  PlanImageCard,
  PlanSectionHeader,
  PlanShell,
  PlanTopBar,
} from "@/components/plan";

export const metadata = { title: "Before You Go · Plan · Jarvis" };
export const dynamic = "force-dynamic";

export default async function PlanBeforePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await getSessionUser();
  if (!user)
    redirect(`/login?next=/plan/${encodeURIComponent(slug)}/before`);

  const brief = await loadPlanBriefBySlug(slug);
  if (!brief) notFound();

  return (
    <PlanShell>
      <PlanTopBar
        backHref={`/plan/${slug}`}
        eyebrowCenter="BEFORE YOU GO"
        showShare
        showMore
      />

      <PlanSectionHeader
        title="Ready the night."
        subtitle="What to wear, what to bring, what to know. Set yourself before you set out."
        meta={[brief.title, brief.dateLabel, brief.timeLabel]}
      />

      <section className="mt-10 px-5">
        <Block label="What to wear">
          <div className="grid grid-cols-[minmax(0,1fr)_140px] gap-5">
            <ul className="flex flex-col">
              {brief.before.wear.map((line, i) => (
                <li
                  key={`${line}-${i}`}
                  className="py-3"
                  style={
                    i !== brief.before.wear.length - 1
                      ? { borderBottom: "1px solid var(--border)" }
                      : undefined
                  }
                >
                  <p
                    className="font-serif italic"
                    style={{
                      color: "var(--text-primary)",
                      fontSize: "16px",
                      lineHeight: 1.45,
                    }}
                  >
                    {line}
                  </p>
                </li>
              ))}
            </ul>
            <PlanImageCard aspect="portrait" />
          </div>
        </Block>

        <PlanDivider variant="inset" className="mx-0 my-8" />

        <Block label="What to bring" sub={`${brief.before.bring.length} things. No more.`}>
          <PlanChecklist items={brief.before.bring} />
        </Block>

        <PlanDivider variant="inset" className="mx-0 my-8" />

        <Block label="What to know" sub="Things worth carrying in.">
          <ul className="mt-3 flex flex-col gap-4">
            {brief.before.know.map((line, i) => (
              <li
                key={`${line}-${i}`}
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
                    fontSize: "16px",
                    lineHeight: 1.5,
                  }}
                >
                  {line}
                </p>
              </li>
            ))}
          </ul>
        </Block>
      </section>

      <ClosingLine>{brief.before.closing ?? "Take your time. The night is staged."}</ClosingLine>
    </PlanShell>
  );
}

function Block({
  label,
  sub,
  children,
}: {
  label: string;
  sub?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div
        className="font-mono uppercase"
        style={{
          color: "var(--gold)",
          fontSize: "11px",
          letterSpacing: "0.2em",
        }}
      >
        {label}
      </div>
      {sub ? (
        <p
          className="mt-1 font-serif italic"
          style={{
            color: "var(--text-muted)",
            fontSize: "15px",
            lineHeight: 1.4,
          }}
        >
          {sub}
        </p>
      ) : null}
      <div className="mt-3">{children}</div>
    </div>
  );
}

function ClosingLine({ children }: { children: ReactNode }) {
  return (
    <p
      className="mt-12 px-5 text-center font-serif italic"
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
