import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { readLibraryHealth } from "@/lib/library";
import { BackButton, MotionPage } from "@/components";

export const metadata = { title: "Library · Jarvis" };
export const dynamic = "force-dynamic";

export default async function SettingsLibraryPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/settings/library");
  if (user.role !== "owner") redirect("/settings");

  const health = await readLibraryHealth({ userId: user.id });
  const rows = [
    ["Places", String(health.places)],
    ["Events", `${health.events} active`],
    ["Sources", String(health.sources)],
    ["People / Tastemakers", String(health.people)],
    ["Organizations", String(health.organizations)],
    ["Neighborhoods", "0"],
    ["Recurring Signals", String(health.recurringSignals)],
    ["Pending Candidates", String(health.pendingCandidates)],
    ["Needs Refresh", String(health.needsRefresh)],
    ["Rejected / Muted", String(health.rejectedMuted)],
  ] as const;

  return (
    <main
      className="lux-page smooth-page mx-auto min-h-[100dvh] w-full max-w-[520px] overflow-x-hidden px-6 text-warm-ivory"
      style={{
        paddingTop: "calc(env(safe-area-inset-top) + 28px)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 72px)",
      }}
    >
      <MotionPage>
        <header>
          <div className="flex items-center gap-1">
            <BackButton fallbackHref="/settings" />
            <span className="lux-label">Library</span>
          </div>
          <h1 className="mt-6 font-serif text-[42px] italic leading-[1.02] text-warm-ivory">
            Intelligence bank.
          </h1>
          <p className="mt-3 max-w-[39ch] font-serif text-[16px] italic leading-[1.45] text-warm-ivory/65">
            Quiet status for the permanent layer under Radar.
          </p>
          <div className="mt-5 h-px w-10 bg-muted-gold/50" />
        </header>

        <section className="motion-card mt-10 grid gap-3">
          {rows.map(([label, value]) => (
            <div
              key={label}
              className="lux-surface-quiet flex min-h-14 items-center justify-between rounded-[var(--radius-card)] px-4"
            >
              <span className="text-[12px] uppercase tracking-editorial text-warm-ivory/50">
                {label}
              </span>
              <span className="font-serif text-[20px] italic text-warm-ivory">
                {value}
              </span>
            </div>
          ))}
        </section>

        <section className="motion-card mt-8 grid grid-cols-3 gap-2">
          <Metric label="Tier A" value={health.tierA} />
          <Metric label="Tier B" value={health.tierB} />
          <Metric label="Tier C" value={health.tierC} />
        </section>
      </MotionPage>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="lux-surface-quiet rounded-[var(--radius-card)] px-3 py-3 text-center">
      <div className="text-[9px] uppercase tracking-editorial text-warm-ivory/42">
        {label}
      </div>
      <div className="mt-1 font-serif text-[22px] italic text-warm-ivory">
        {value}
      </div>
    </div>
  );
}
