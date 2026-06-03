import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSessionUser } from "@/lib/auth";
import { readLibraryHealth } from "@/lib/library";
import { readLibraryPreview, type LibraryPreviewCandidate, type LibraryPreviewEntity, type LibraryPreviewIntentItem, type LibraryPreviewRejected, type LibraryPreviewSource } from "@/lib/library/previews";
import { readLibraryControlRoomStatus } from "@/lib/radar/autopilotRuns";
import { BOOTSTRAP_TARGETS } from "@/lib/radar/bootstrapPolicy";
import { FOUNDATION_SPRINT_TARGETS } from "@/lib/radar/foundationSprint";
import { readRadarPromotionDiagnostics, type RadarPromotionDiagnostic } from "@/lib/radar/promotionDiagnostics";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { BackButton, MotionPage } from "@/components";
import { ControlRoomActions } from "./ControlRoomActions";

export const metadata = { title: "Library · Jarvis" };
export const dynamic = "force-dynamic";

const DISPLAY_TIME_ZONE = "America/Chicago";

export default async function SettingsLibraryPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/settings/library");
  if (user.role !== "owner") redirect("/settings");

  const supabase = await getServerSupabase();
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
    supabase,
  });
  const [preview, promotionDiagnostics] = await Promise.all([
    readLibraryPreview({ userId: user.id, supabase, limit: 25 }),
    readRadarPromotionDiagnostics({ userId: user.id, supabase, limit: 20 }),
  ]);
  const { data: lastTasteSeedImport } = await supabase
    .from("intelligence_traces")
    .select("created_at,outcome,selected_candidate,context_summary")
    .eq("user_id", user.id)
    .eq("route", "lib/tasteSeed/importer.commitTasteSeedImport")
    .eq("decision_type", "taste_seed_import")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: circleRows } = await supabase
    .from("circle_people")
    .select("id,notes")
    .eq("user_id", user.id);
  const importedCirclePeople = ((circleRows ?? []) as Array<{ notes?: string[] | null }>)
    .filter((row) => (row.notes ?? []).some((note) => note.includes("taste_seed_import")))
    .length;
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
                foundationSprintEnabled={control.settings.foundationSprintEnabled}
              />
            </div>
          </div>

          <div className="lux-surface-quiet rounded-[var(--radius-card)] px-4 py-4">
            <div className="text-[11px] uppercase tracking-editorial text-warm-ivory/45">
              Foundation Sprint
            </div>
            <div className="mt-2 font-serif text-[20px] italic text-warm-ivory">
              {control.settings.foundationSprintEnabled
                ? "Active"
                : bootstrapNeeded ? "Off · needed" : "Completed / maintenance"}
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-warm-ivory/55">
              {control.settings.foundationSprintEnabled
                ? "Jarvis is allowed to run aggressive bounded mission batches in the background until the bank is healthy."
                : bootstrapNeeded
                  ? "The intelligence bank is still thin. Start Foundation Sprint to keep building while the app is closed."
                  : "The permanent intelligence bank has enough base inventory for normal Autopilot maintenance."}
            </p>
            <p className="mt-3 text-[11px] leading-relaxed text-warm-ivory/42">
              Places {health.places}/{FOUNDATION_SPRINT_TARGETS.places} · Events {health.events}/{FOUNDATION_SPRINT_TARGETS.activeEvents} · Sources {health.sources}/{FOUNDATION_SPRINT_TARGETS.sources} · Candidates {health.pendingCandidates}/{FOUNDATION_SPRINT_TARGETS.candidateInbox} · Tier A/B {tierAPlusB}/{FOUNDATION_SPRINT_TARGETS.tierAPlusB}
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
              ? formatTimestamp(String(lastTasteSeedImport.created_at))
              : "None yet"}
          />
          <StatusRow
            label="Circle seed people"
            value={importedCirclePeople > 0 ? `${importedCirclePeople} visible` : "None imported"}
          />
          <StatusRow
            label="Current mission"
            value={control.activeRun?.operation ?? "None"}
          />
          <StatusRow
            label="Sprint cursor"
            value={control.settings.foundationSprintEnabled
              ? String(control.settings.foundationSprintMissionCursor)
              : "Off"}
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
              ? `${control.lastRun.operation ?? control.lastRun.status} · ${formatTimestamp(control.lastRun.started_at)}`
              : "None yet"}
          />
          <StatusRow
            label="Last bootstrap"
            value={control.lastBootstrapRun
              ? formatTimestamp(control.lastBootstrapRun.started_at)
              : "None yet"}
          />
          <StatusRow
            label="Next scheduled"
            value={control.settings.foundationSprintEnabled ? "Within 15m" : control.settings.enabled ? "Within 2h" : "Paused"}
          />
          {control.lastRun?.summary ? (
            <p className="lux-surface-quiet rounded-[var(--radius-card)] px-4 py-3 text-[12px] leading-relaxed text-warm-ivory/58">
              {control.lastRun.summary}
            </p>
          ) : null}
          {control.lastRun?.error_message ? (
            <details className="lux-surface-quiet rounded-[var(--radius-card)] px-4 py-3 text-[12px] leading-relaxed text-warm-ivory/58">
              <summary className="cursor-pointer text-[11px] uppercase tracking-editorial text-warm-ivory/45">
                Last error detail
              </summary>
              <p className="mt-2 text-warm-ivory/58">
                {safeErrorDetail(control.lastRun.error_message)}
              </p>
              <p className="mt-2 text-warm-ivory/34">
                Partial progress preserved: +{control.lastRun.candidates_created} candidates, +{control.lastRun.sources_created} sources, +{control.lastRun.library_items_created} library/events, promoted {control.lastRun.candidates_promoted}.
              </p>
            </details>
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
              <span className="text-warm-ivory/34">{formatTimestamp(event.created_at)} — </span>
              {event.message}
            </p>
          )) : (
            <p className="lux-surface-quiet rounded-[var(--radius-card)] px-4 py-3 text-[12px] leading-relaxed text-warm-ivory/50">
              No autopilot runs yet. Run Bootstrap to start building the intelligence bank.
            </p>
          )}
        </section>

        <section className="motion-card mt-8 grid gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-editorial text-warm-ivory/45">
              Radar Promotion Diagnostics
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-warm-ivory/55">
              {promotionDiagnostics.summary}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-warm-ivory/34">
              Active {promotionDiagnostics.activeCount}/{promotionDiagnostics.target} target · cap {promotionDiagnostics.cap}. Raw Candidate Inbox does not promote directly.
            </p>
          </div>
          <PreviewDetails title="Why Radar is quiet" count={promotionDiagnostics.items.length} open>
            {promotionDiagnostics.items.length > 0 ? promotionDiagnostics.items.map((item) => (
              <PromotionRow key={`${item.sourceLayer}:${item.id}`} item={item} />
            )) : (
              <EmptyPreview text="No promotion candidates were available to review." />
            )}
          </PreviewDetails>
        </section>

        <section className="motion-card mt-8 grid gap-3">
          <div className="text-[11px] uppercase tracking-editorial text-warm-ivory/45">
            Library Preview
          </div>
          <PreviewDetails title="Pending Candidates" count={preview.candidates.length} open>
            {preview.candidates.length > 0 ? preview.candidates.map((candidate) => (
              <CandidateRow key={candidate.id} candidate={candidate} />
            )) : (
              <EmptyPreview text="No Candidate Inbox rows yet." />
            )}
          </PreviewDetails>
          <PreviewDetails title="Sources" count={preview.sources.length}>
            {preview.sources.length > 0 ? preview.sources.map((source) => (
              <SourceRow key={source.id} source={source} />
            )) : (
              <EmptyPreview text="No Source Graph rows yet." />
            )}
          </PreviewDetails>
          <PreviewDetails title="Places" count={preview.places.length}>
            {preview.places.length > 0 ? preview.places.map((entity) => (
              <EntityRow key={entity.id} entity={entity} />
            )) : (
              <EmptyPreview text="No Places Library rows yet." />
            )}
          </PreviewDetails>
          <PreviewDetails title="Events" count={preview.events.length}>
            {preview.events.length > 0 ? preview.events.map((entity) => (
              <EntityRow key={entity.id} entity={entity} />
            )) : (
              <EmptyPreview text="No active Event Pulse rows yet." />
            )}
          </PreviewDetails>
          <PreviewDetails title="Rejected / Muted" count={preview.rejectedMuted.length}>
            {preview.rejectedMuted.length > 0 ? preview.rejectedMuted.map((item) => (
              <RejectedRow key={`${item.status}:${item.id}`} item={item} />
            )) : (
              <EmptyPreview text="No rejected or muted rows yet." />
            )}
          </PreviewDetails>
          <PreviewDetails title="Later / Watch / Better Version" count={preview.intentItems.length}>
            {preview.intentItems.length > 0 ? preview.intentItems.map((item) => (
              <IntentRow key={item.id} item={item} />
            )) : (
              <EmptyPreview text="No intent queue rows yet." />
            )}
          </PreviewDetails>
          <PreviewDetails title="Tier A" count={preview.tiers.A.length}>
            {preview.tiers.A.length > 0 ? preview.tiers.A.map((entity) => (
              <EntityRow key={entity.id} entity={entity} />
            )) : (
              <EmptyPreview text="No Tier A Library rows yet." />
            )}
          </PreviewDetails>
          <PreviewDetails title="Tier B" count={preview.tiers.B.length}>
            {preview.tiers.B.length > 0 ? preview.tiers.B.map((entity) => (
              <EntityRow key={entity.id} entity={entity} />
            )) : (
              <EmptyPreview text="No Tier B Library rows yet." />
            )}
          </PreviewDetails>
          <PreviewDetails title="Tier C" count={preview.tiers.C.length}>
            {preview.tiers.C.length > 0 ? preview.tiers.C.map((entity) => (
              <EntityRow key={entity.id} entity={entity} />
            )) : (
              <EmptyPreview text="No Tier C Library rows yet." />
            )}
          </PreviewDetails>
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

function PreviewDetails({
  title,
  count,
  open = false,
  children,
}: {
  title: string;
  count: number;
  open?: boolean;
  children: ReactNode;
}) {
  return (
    <details open={open} className="lux-surface-quiet rounded-[var(--radius-card)] px-4 py-3">
      <summary className="cursor-pointer list-none">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] uppercase tracking-editorial text-warm-ivory/45">
            {title}
          </span>
          <span className="font-serif text-[17px] italic text-warm-ivory">
            {count}
          </span>
        </div>
      </summary>
      <div className="mt-3 grid gap-2">
        {children}
      </div>
    </details>
  );
}

function CandidateRow({ candidate }: { candidate: LibraryPreviewCandidate }) {
  return (
    <PreviewRow
      title={candidate.title}
      meta={`${candidate.entityType} · ${candidate.status} · ${formatScore(candidate.score)} · ${formatTimestamp(candidate.discoveredAt)}`}
      body={candidate.rejectionReason ?? candidate.reason ?? "Captured for evaluation before Library, Holding, or Active Radar."}
      footer={candidate.source ? `Source: ${candidate.source}` : candidate.campaign ? `Campaign: ${candidate.campaign}` : null}
    />
  );
}

function SourceRow({ source }: { source: LibraryPreviewSource }) {
  return (
    <PreviewRow
      title={source.title}
      meta={`${source.sourceType} · ${source.status} · trust ${formatScore(source.trustScore)} · taste ${formatScore(source.tasteFitScore)}`}
      body={source.reason ?? `Candidates ${source.totalCandidates}, Library ${source.totalLibraryItems}, save/pass/plan ${percent(source.saveRate)}/${percent(source.passRate)}/${percent(source.planRate)}.`}
      footer={[
        source.lastCheckedAt ? `Last ${formatTimestamp(source.lastCheckedAt)}` : null,
        source.nextCheckAt ? `Next ${formatTimestamp(source.nextCheckAt)}` : null,
        source.domain,
      ].filter(Boolean).join(" · ") || null}
    />
  );
}

function EntityRow({ entity }: { entity: LibraryPreviewEntity }) {
  return (
    <PreviewRow
      title={entity.title}
      meta={`${entity.type} · ${entity.status} · tier ${entity.tier ?? "none"} · ${formatScore(entity.score)}`}
      body={entity.summary ?? "Stored as durable Library context; not automatically surfaced to Radar."}
      footer={[
        entity.when ? `When ${formatTimestamp(entity.when)}` : null,
        entity.tags.slice(0, 4).join(", "),
      ].filter(Boolean).join(" · ") || null}
    />
  );
}

function RejectedRow({ item }: { item: LibraryPreviewRejected }) {
  return (
    <PreviewRow
      title={item.title}
      meta={`${item.type} · ${item.status} · ${formatTimestamp(item.rejectedAt)}`}
      body={item.reason ?? "Filtered out during evaluation."}
      footer={item.source ? `Source: ${item.source}` : null}
    />
  );
}

function IntentRow({ item }: { item: LibraryPreviewIntentItem }) {
  return (
    <PreviewRow
      title={item.title}
      meta={`${item.intent} · ${item.destination}/${item.status} · ${formatTimestamp(item.updatedAt)}`}
      body={item.reason ?? "Owner intent is stored on the item and used to tune resurfacing."}
      footer="These rows can guide future discovery without repeating the same item in Active Radar."
    />
  );
}

function PromotionRow({ item }: { item: RadarPromotionDiagnostic }) {
  return (
    <PreviewRow
      title={item.title}
      meta={`${item.sourceLayer} · ${item.radarEligible ? "eligible" : "blocked"} · ${formatScore(item.score)} · next: ${item.nextStep}`}
      body={item.reason}
      footer={item.blockers.length > 0 ? `Blockers: ${item.blockers.slice(0, 3).join(" · ")}` : "No blockers recorded."}
    />
  );
}

function PreviewRow({
  title,
  meta,
  body,
  footer,
}: {
  title: string;
  meta: string;
  body: string;
  footer: string | null;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-white/[0.06] px-3 py-3">
      <div className="grid gap-1">
        <h3 className="text-[13px] leading-snug text-warm-ivory/86">
          {title}
        </h3>
        <span className="text-[10px] uppercase tracking-editorial text-warm-ivory/34">
          {meta}
        </span>
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-warm-ivory/55">
        {body}
      </p>
      {footer ? (
        <p className="mt-2 text-[11px] leading-relaxed text-warm-ivory/34">
          {footer}
        </p>
      ) : null}
    </div>
  );
}

function EmptyPreview({ text }: { text: string }) {
  return (
    <p className="rounded-[var(--radius-card)] border border-white/[0.06] px-3 py-3 text-[12px] leading-relaxed text-warm-ivory/45">
      {text}
    </p>
  );
}

function relativeTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000);
  if (minutes < 0) {
    const futureMinutes = Math.abs(minutes);
    if (futureMinutes < 60) return `in ${futureMinutes}m`;
    const futureHours = Math.round(futureMinutes / 60);
    if (futureHours < 48) return `in ${futureHours}h`;
    return `in ${Math.round(futureHours / 24)}d`;
  }
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${relativeTime(value)} · ${date.toLocaleTimeString("en-US", {
    timeZone: DISPLAY_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

function stateLabel(state: string): string {
  if (state === "bootstrap_needed") return "Bootstrap needed";
  if (state === "foundation_sprint") return "Foundation Sprint";
  if (state === "partial_success") return "Partial success";
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
    case "foundation_sprint":
      return "Foundation Sprint is active. Jarvis will keep running bounded mission batches until targets are healthy.";
    case "partial_success":
      return "The last run preserved useful work and is waiting for the next scheduled batch.";
    case "bootstrap_needed":
      return "The intelligence bank is thin. Bootstrap can build sources, candidates, and Library rows from real providers.";
    default:
      return "Autopilot is idle and ready.";
  }
}

function safeErrorDetail(value: string): string {
  return value.replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, "$1[redacted]");
}

function formatScore(value: number | null): string {
  if (typeof value !== "number") return "no score";
  return value.toFixed(2);
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
