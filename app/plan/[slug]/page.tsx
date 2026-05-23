import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSessionUser } from "@/lib/auth";
import { loadPlanBySlugV2, type LoadedPlanSection } from "@/lib/plans/loadPlan";
import { BackButton, MotionPage } from "@/components";
import { PlanActionButton } from "./client-bits";

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

  const plan = await loadPlanBySlugV2(slug);
  if (!plan) notFound();

  const isDraft = plan.status === "draft";
  const isActive = plan.status === "active";
  const isCompleted = plan.status === "completed";
  const isCancelled = plan.status === "cancelled";
  const orderedSections = orderPlanSections(plan.sections);
  const stats = [
    plan.effortLevel
      ? { label: "Effort", value: formatLabel(plan.effortLevel) }
      : null,
    plan.spendingPosture
      ? { label: "Spending", value: formatLabel(plan.spendingPosture) }
      : null,
    plan.timeWindow || plan.bestWindow
      ? { label: "Window", value: plan.timeWindow ?? plan.bestWindow ?? "" }
      : null,
    plan.sourceItemType
      ? { label: "Source", value: formatLabel(plan.sourceItemType) }
      : null,
    plan.dateLabel ? { label: "Date", value: plan.dateLabel } : null,
  ].filter((item): item is { label: string; value: string } => Boolean(item));

  return (
    <main
      className="lux-page smooth-page mx-auto min-h-[100dvh] w-full max-w-[680px] overflow-x-hidden px-6 text-warm-ivory"
      style={{
        paddingTop: "calc(env(safe-area-inset-top) + 32px)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 48px)",
      }}
    >
      <MotionPage>
        <header className="flex items-baseline justify-between">
          <BackButton
            fallbackHref={plan.sourceItemId ? `/item/${plan.sourceItemId}` : "/"}
          />
          <div className="flex items-baseline gap-5">
            <Link
              href="/"
              className="text-[12px] uppercase tracking-editorial text-warm-ivory/45 transition-colors duration-300 ease-atmospheric hover:text-warm-ivory/75"
            >
              Today
            </Link>
            {plan.sourceItemId ? (
              <Link
                href={`/item/${plan.sourceItemId}`}
                className="text-[12px] uppercase tracking-editorial text-warm-ivory/55 transition-colors duration-300 ease-atmospheric hover:text-warm-ivory/80"
              >
                Source
              </Link>
            ) : null}
          </div>
        </header>

        {/* Hero */}
        <section className="mt-6">
          <div className="flex items-center gap-3">
            <PlanTypePill type={plan.planType} />
            <PlanStatusPill status={plan.status} />
            {plan.fallbackUsed ? (
              <span className="rounded-md border border-white/[0.08] px-2 py-0.5 text-[10px] uppercase tracking-editorial text-warm-ivory/45">
                Draft (fallback)
              </span>
            ) : null}
          </div>
          <h1 className="mt-4 font-serif text-[44px] italic leading-[1.05] tracking-[-0.01em] text-warm-ivory">
            {plan.title}
          </h1>
          <p className="mt-2 text-[11px] uppercase tracking-editorial text-warm-ivory/40">
            {plan.sourceItemType
              ? `From ${formatLabel(plan.sourceItemType)}`
              : "Generated plan"}
            {plan.locationLine ? ` · ${plan.locationLine}` : ""}
          </p>
          {plan.heroAngle ? (
            <p className="mt-3 max-w-[44ch] font-serif text-[20px] italic leading-[1.3] text-warm-ivory/70">
              {plan.heroAngle}
            </p>
          ) : null}
        </section>

        {/* Quick stats */}
        <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.slice(0, 4).map((stat) => (
            <Stat key={stat.label} label={stat.label} value={stat.value} />
          ))}
        </section>

        {plan.whyThisFits ? (
          <section className="lux-surface-quiet mt-8 rounded-[var(--radius-card)] px-5 py-4">
            <h2 className="text-[11px] uppercase tracking-editorial text-muted-gold">
              Why this fits
            </h2>
            <p className="mt-2 text-[14px] leading-[1.55] text-warm-ivory/80">
              {plan.whyThisFits}
            </p>
          </section>
        ) : null}

        {plan.primaryMove ? (
          <section className="lux-surface mt-4 rounded-[var(--radius-card)] px-5 py-4">
            <h2 className="text-[11px] uppercase tracking-editorial text-muted-gold">
              Primary move
            </h2>
            <p className="mt-2 text-[14px] leading-[1.55] text-warm-ivory/82">
              {plan.primaryMove}
            </p>
          </section>
        ) : null}

        {/* Actions */}
        <section className="mt-8 flex flex-wrap items-center gap-3">
          {isDraft ? (
            <PlanActionButton
              planId={plan.id}
              action="activate"
              label="Start plan"
              variant="primary"
            />
          ) : null}
          {isActive ? (
            <>
              <span className="inline-flex items-center gap-2 rounded-full border border-[#7BC4A0]/35 bg-[#7BC4A0]/5 px-5 py-2.5 text-[11px] uppercase tracking-editorial text-[#7BC4A0]">
                <span
                  aria-hidden
                  className="pulse-dot h-1.5 w-1.5 rounded-full bg-[#7BC4A0]"
                />
                Live
              </span>
              <PlanActionButton
                planId={plan.id}
                action="complete"
                label="Complete"
                variant="primary"
              />
            </>
          ) : null}
          {(isDraft || isActive) ? (
            <PlanActionButton
              planId={plan.id}
              action="cancel"
              label="Cancel"
              variant="ghost"
            />
          ) : null}
          {isCompleted ? (
            <span className="text-[12px] uppercase tracking-editorial text-warm-ivory/55">
              Completed
            </span>
          ) : null}
          {isCancelled ? (
            <span className="text-[12px] uppercase tracking-editorial text-warm-ivory/45">
              Cancelled
            </span>
          ) : null}
        </section>

        {/* Sections */}
        {orderedSections.length > 0 ? (
          <div className="mt-10 flex flex-col gap-7">
            {orderedSections.map((s) => (
              <PlanSection key={s.id} section={s} />
            ))}
          </div>
        ) : (
          <EmptyBlock
            title="No sections yet."
            body="This plan exists, but Jarvis did not save section detail for it."
          />
        )}

        {/* Timeline */}
        {plan.timeline.length > 0 ? (
          <section className="mt-10">
            <SectionLabel>Timeline</SectionLabel>
            <ul className="mt-3 flex flex-col gap-3">
              {plan.timeline.map((t) => (
                <li
                  key={t.id}
                  className="lux-surface-quiet flex items-start gap-4 rounded-[var(--radius-soft)] px-4 py-3"
                >
                  <div className="w-[68px] shrink-0 text-[11px] uppercase tracking-editorial text-muted-gold">
                    {t.time}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] text-warm-ivory">{t.title}</div>
                    {t.details ? (
                      <p className="mt-1 text-[12px] leading-[1.5] text-warm-ivory/55">
                        {t.details}
                      </p>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-[10px] uppercase tracking-editorial text-warm-ivory/35">
                    {t.status}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <EmptyBlock
            title="No timeline yet."
            body="Start with the plan sections above; timing can be added later."
          />
        )}

        {/* Grab list */}
        {plan.grabList.length > 0 ? (
          <section className="mt-10">
            <SectionLabel>Bring</SectionLabel>
            <ul className="mt-3 flex flex-col gap-2">
              {plan.grabList.map((g, i) => (
                <li
                  key={i}
                  className="flex items-baseline justify-between gap-3 border-b border-white/[0.05] pb-2 last:border-0"
                >
                  <span className="text-[13px] text-warm-ivory">{g.label}</span>
                  {g.reason ? (
                    <span className="text-[11px] text-warm-ivory/45">
                      {g.reason}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Cautions */}
        {plan.cautions.length > 0 ? (
          <section className="mt-10">
            <SectionLabel>Heads up</SectionLabel>
            <ul className="mt-3 flex flex-col gap-2 text-[13px] leading-[1.5] text-warm-ivory/65">
              {plan.cautions.map((c, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-[7px] inline-block h-[3px] w-[3px] shrink-0 rounded-full bg-[#E07A6E]/60" />
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <footer className="mt-12 border-t border-white/[0.065] pt-5 text-[11px] uppercase tracking-[0.2em] text-warm-ivory/30">
          {plan.confidence != null
            ? `Confidence ${Math.round(plan.confidence * 100)}%`
            : "Generated plan"}
        </footer>
      </MotionPage>
    </main>
  );
}

// ── UI atoms ─────────────────────────────────────────────────────────────────

function PlanSection({ section }: { section: LoadedPlanSection }) {
  return (
    <section>
      <h2 className="text-[11px] uppercase tracking-editorial text-muted-gold">
        {section.title}
      </h2>
      {section.subtitle ? (
        <p className="mt-1 text-[12px] text-warm-ivory/55">{section.subtitle}</p>
      ) : null}
      <div className="mt-3 whitespace-pre-line text-[14px] leading-[1.6] text-warm-ivory/85">
        {section.body}
      </div>
      {section.bullets.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2 text-[13px] leading-[1.5] text-warm-ivory/75">
          {section.bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-[7px] inline-block h-[3px] w-[3px] shrink-0 rounded-full bg-muted-gold/60" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

const SECTION_ORDER: Record<string, number> = {
  before: 10,
  timing: 15,
  move: 20,
  atmosphere: 30,
  route: 40,
  bring: 42,
  wear: 44,
  cost: 46,
  notes: 50,
  detours: 60,
  alternatives: 65,
  research: 70,
  after: 80,
  why: 90,
};

function orderPlanSections(
  sections: LoadedPlanSection[],
): LoadedPlanSection[] {
  return [...sections].sort((a, b) => {
    const aOrder = SECTION_ORDER[a.sectionType] ?? 75;
    const bOrder = SECTION_ORDER[b.sectionType] ?? 75;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.sortOrder - b.sortOrder;
  });
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-[11px] uppercase tracking-editorial text-muted-gold">
      {children}
    </h2>
  );
}

function EmptyBlock({ title, body }: { title: string; body: string }) {
  return (
    <section className="lux-surface-quiet mt-10 rounded-[var(--radius-card)] px-5 py-4">
      <h2 className="text-[11px] uppercase tracking-editorial text-muted-gold">
        {title}
      </h2>
      <p className="mt-2 text-[13px] leading-[1.55] text-warm-ivory/50">
        {body}
      </p>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="lux-surface-quiet rounded-[var(--radius-soft)] px-3 py-2">
      <div className="text-[10px] uppercase tracking-editorial text-warm-ivory/40">
        {label}
      </div>
      <div className="mt-1 truncate text-[13px] text-warm-ivory/85">{value}</div>
    </div>
  );
}

function PlanTypePill({ type }: { type: string }) {
  return (
    <span className="rounded-md border border-muted-gold/30 px-2 py-0.5 text-[10px] uppercase tracking-editorial text-muted-gold">
      {type}
    </span>
  );
}

const PLAN_STATUS_COLOR: Record<string, string> = {
  draft: "text-warm-ivory/55 border-white/[0.10]",
  active: "text-[#7BC4A0] border-[#7BC4A0]/40",
  completed: "text-warm-ivory/55 border-white/[0.08]",
  cancelled: "text-warm-ivory/35 border-white/[0.06]",
};

function PlanStatusPill({ status }: { status: string }) {
  return (
    <span
      className={
        "rounded-md border px-2 py-0.5 text-[10px] uppercase tracking-editorial " +
        (PLAN_STATUS_COLOR[status] ?? "text-warm-ivory/55 border-white/[0.10]")
      }
    >
      {status}
    </span>
  );
}

function formatLabel(value: string): string {
  return value.replace(/_/g, " ");
}
