import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { readLibraryHealth } from "@/lib/library";
import { readLibraryControlRoomStatus } from "@/lib/radar/autopilotRuns";
import { BOOTSTRAP_TARGETS } from "@/lib/radar/bootstrapPolicy";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { BackButton, MotionPage } from "@/components";
import { ControlRoomActions } from "./ControlRoomActions";

export const metadata = { title: "Library · Jarvis" };
export const dynamic = "force-dynamic";

export default async function SettingsLibraryPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/settings/library");
  if (user.role !== "owner") redirect("/settings");

  const health = await readLibraryHealth({ userId: user.id });
  const tierAPlusB = health.tierA + health.tierB;
  const bootstrapNeeded =
    health.places < BOOTSTRAP_TARGETS.places ||
    health.events < BOOTSTRAP_TARGETS.activeEvents ||
    health.sources < BOOTSTRAP_TARGETS.sources ||
    health.pendingCandidates < BOOTSTRAP_TARGETS.candidateInbox ||
    tierAPlusB < BOOTSTRAP_TARGETS.tierAPlusB;
  const control = await readLibraryControlRoomStatus({
    userId: user.id,
    bootstrapNeeded,
  });
  const supabase = await getServerSupabase();
  const { data: lastTasteSeedImport } = await supabase
    .from("intelligence_traces")
    .select("created_at,outcome,selected_candidate,context_summary")
    .eq("user_id", user.id)
    .eq("route", "lib/tasteSeed/importer.commitTasteSeedImport")
    .eq("decision_type", "taste_seed_import")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
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
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] uppercase tracking-editorial text-warm-ivory/45">
                Control Room
              </span>
              <span className="font-serif text-[17px] italic text-warm-ivory">
                {stateLabel(control.state)}
              </span>
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-warm-ivory/55">
              {controlSummary(control.state)}
            </p>
            {control.missingProviders.length > 0 ? (
              <p className="mt-2 text-[11px] leading-relaxed text-warm-ivory/42">
                Missing providers: {control.missingProviders.join(", ")}
              </p>
            ) : null}
            <div className="mt-4">
              <ControlRoomActions
                enabled={control.settings.enabled}
                activeRunId={control.activeRun?.id ?? null}
              />
            </div>
          </div>

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
          <StatusRow
            label="Taste seed import"
            value={lastTasteSeedImport?.created_at
              ? relativeTime(String(lastTasteSeedImport.created_at))
              : "None yet"}
          />
          {lastTasteSeedImport?.outcome ? (
            <p className="lux-surface-quiet rounded-[var(--radius-card)] px-4 py-3 text-[12px] leading-relaxed text-warm-ivory/58">
              {String(lastTasteSeedImport.outcome)}
            </p>
          ) : null}
          <StatusRow
            label="Current operation"
            value={control.activeRun?.operation ?? "None"}
          />
          <StatusRow
            label="Last operation"
            value={control.lastRun
              ? `${control.lastRun.operation ?? control.lastRun.status} · ${relativeTime(control.lastRun.started_at)}`
              : "None yet"}
          />
          <StatusRow
            label="Last bootstrap"
            value={control.lastBootstrapRun
              ? relativeTime(control.lastBootstrapRun.started_at)
              : "None yet"}
          />
          <StatusRow
            label="Next scheduled"
            value={control.settings.enabled ? "Within 2h" : "Paused"}
          />
          {control.lastRun?.summary ? (
            <p className="lux-surface-quiet rounded-[var(--radius-card)] px-4 py-3 text-[12px] leading-relaxed text-warm-ivory/58">
              {control.lastRun.summary}
            </p>
          ) : null}
        </section>

        <section className="motion-card mt-8 grid gap-2">
          {control.providerStatus.map((provider) => (
            <StatusRow
              key={provider.key}
              label={provider.name}
              value={provider.configured ? provider.purpose : "Missing key"}
            />
          ))}
        </section>

        <section className="motion-card mt-8 grid gap-2">
          <div className="text-[11px] uppercase tracking-editorial text-warm-ivory/45">
            Activity
          </div>
          {control.activity.length > 0 ? control.activity.slice(0, 12).map((event) => (
            <p
              key={event.id}
              className="lux-surface-quiet rounded-[var(--radius-card)] px-4 py-3 text-[12px] leading-relaxed text-warm-ivory/58"
            >
              <span className="text-warm-ivory/34">{timeOnly(event.created_at)} — </span>
              {event.message}
            </p>
          )) : (
            <p className="lux-surface-quiet rounded-[var(--radius-card)] px-4 py-3 text-[12px] leading-relaxed text-warm-ivory/50">
              No autopilot runs yet. Run Bootstrap to start building the intelligence bank.
            </p>
          )}
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

function stateLabel(state: string): string {
  if (state === "bootstrap_needed") return "Bootstrap needed";
  return state.charAt(0).toUpperCase() + state.slice(1);
}

function controlSummary(state: string): string {
  switch (state) {
    case "running":
      return "Jarvis is actively building or reviewing the intelligence bank.";
    case "paused":
      return "Scheduled Autopilot is paused. Manual runs are still available.";
    case "blocked":
      return "Discovery is blocked because no external provider keys are configured.";
    case "failed":
      return "The last Autopilot run failed. Check activity before retrying.";
    case "healthy":
      return "Foundation targets are healthy enough for normal background maintenance.";
    case "bootstrap_needed":
      return "The intelligence bank is thin. Bootstrap can build sources, candidates, and Library rows from real providers.";
    default:
      return "Autopilot is idle and ready.";
  }
}

function timeOnly(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
