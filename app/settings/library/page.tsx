import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { readLibraryHealth, readLibraryOperationalStatus } from "@/lib/library";
import { BOOTSTRAP_TARGETS } from "@/lib/radar/bootstrapPolicy";
import { BackButton, MotionPage } from "@/components";

export const metadata = { title: "Library · Jarvis" };
export const dynamic = "force-dynamic";

export default async function SettingsLibraryPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/settings/library");
  if (user.role !== "owner") redirect("/settings");

  const [health, operations] = await Promise.all([
    readLibraryHealth({ userId: user.id }),
    readLibraryOperationalStatus({ userId: user.id }),
  ]);
  const tierAPlusB = health.tierA + health.tierB;
  const bootstrapNeeded =
    health.places < BOOTSTRAP_TARGETS.places ||
    health.events < BOOTSTRAP_TARGETS.activeEvents ||
    health.sources < BOOTSTRAP_TARGETS.sources ||
    health.pendingCandidates < BOOTSTRAP_TARGETS.candidateInbox ||
    tierAPlusB < BOOTSTRAP_TARGETS.tierAPlusB;
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
          <div className="lux-surface-quiet rounded-[var(--radius-card)] px-4 py-4">
            <div className="text-[11px] uppercase tracking-editorial text-warm-ivory/45">
              Bootstrap
            </div>
            <div className="mt-2 font-serif text-[20px] italic text-warm-ivory">
              {bootstrapNeeded ? "Foundation build needed" : "Foundation healthy"}
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-warm-ivory/55">
              {bootstrapNeeded
                ? "Jarvis has the structure, but the intelligence bank is still thin. Refresh Radar to trigger bootstrap, or wait for the background Autopilot."
                : "The permanent intelligence bank has enough base inventory for normal Autopilot maintenance."}
            </p>
            <p className="mt-3 text-[11px] leading-relaxed text-warm-ivory/42">
              Places {health.places}/{BOOTSTRAP_TARGETS.places} · Events {health.events}/{BOOTSTRAP_TARGETS.activeEvents} · Sources {health.sources}/{BOOTSTRAP_TARGETS.sources} · Candidates {health.pendingCandidates}/{BOOTSTRAP_TARGETS.candidateInbox} · Tier A/B {tierAPlusB}/{BOOTSTRAP_TARGETS.tierAPlusB}
            </p>
          </div>
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

        <section className="motion-card mt-8 grid gap-3">
          <StatusRow label="Sources watching" value={operations.sourceStatuses.watching} />
          <StatusRow label="Sources testing" value={operations.sourceStatuses.testing} />
          <StatusRow label="Sources cooldown" value={operations.sourceStatuses.cooldown} />
          <StatusRow
            label="Last operation"
            value={operations.lastAutopilotRun
              ? `${operations.lastAutopilotRun.operation} · ${relativeTime(operations.lastAutopilotRun.createdAt)}`
              : "None yet"}
          />
          <StatusRow
            label="Last bootstrap"
            value={operations.lastBootstrapRun
              ? relativeTime(operations.lastBootstrapRun.createdAt)
              : "None yet"}
          />
          {operations.lastAutopilotRun?.summary ? (
            <p className="lux-surface-quiet rounded-[var(--radius-card)] px-4 py-3 text-[12px] leading-relaxed text-warm-ivory/58">
              {operations.lastAutopilotRun.summary}
            </p>
          ) : null}
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

function StatusRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="lux-surface-quiet flex min-h-12 items-center justify-between rounded-[var(--radius-card)] px-4">
      <span className="text-[11px] uppercase tracking-editorial text-warm-ivory/45">
        {label}
      </span>
      <span className="max-w-[58%] text-right text-[12px] leading-snug text-warm-ivory/76">
        {value}
      </span>
    </div>
  );
}

function relativeTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
