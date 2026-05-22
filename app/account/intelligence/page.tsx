import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { BackButton, MotionPage } from "@/components";
import { hasAnthropic } from "@/lib/ai/anthropic";
import { hasGooglePlaces } from "@/lib/sources/googlePlaces";
import { hasMapbox } from "@/lib/sources/mapbox";
import { hasTicketmaster } from "@/lib/sources/ticketmaster";
import { hasTavily } from "@/lib/sources/tavily";
import { hasBrave } from "@/lib/sources/brave";
import { hasSerpapi } from "@/lib/sources/serpapi";
import {
  CleanRadarButton,
  IntelligenceRunButton,
  RefreshRadarButton,
} from "./client-bits";
import type { BrainDecisionRunRow } from "@/lib/types/database";
import {
  RADAR_REFRESH_COOLDOWN_MINUTES,
  RADAR_ACTIVE_ITEM_LIMIT,
  RADAR_MIN_CONFIDENCE,
} from "@/lib/brain/constants";

export const metadata = { title: "Intelligence · Account" };
export const dynamic = "force-dynamic";

export default async function IntelligencePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/account/intelligence");

  const isOwner = user.role === "owner";
  const [recentRuns, radarStats] = await Promise.all([
    isOwner ? safeRecentRuns() : Promise.resolve([]),
    isOwner ? safeRadarStats() : Promise.resolve(null),
  ]);

  const lastRun = recentRuns[0] ?? null;
  const lastFallbackReason = lastRun ? readFallbackReasonFromRun(lastRun) : undefined;
  const cooldownMs = RADAR_REFRESH_COOLDOWN_MINUTES * 60 * 1000;
  const nextAllowed = lastRun
    ? new Date(new Date(lastRun.created_at).getTime() + cooldownMs)
    : null;
  const inCooldown = nextAllowed != null && nextAllowed > new Date();

  const services: { label: string; configured: boolean }[] = [
    { label: "Anthropic (Claude)", configured: hasAnthropic() },
    { label: "Google Places", configured: hasGooglePlaces() },
    { label: "Mapbox", configured: hasMapbox() },
    { label: "Ticketmaster", configured: hasTicketmaster() },
    { label: "Tavily", configured: hasTavily() },
    { label: "Brave Search", configured: hasBrave() },
    { label: "SerpAPI", configured: hasSerpapi() },
    { label: "Open-Meteo (no key)", configured: true },
  ];

  return (
    <main
      className="smooth-page mx-auto min-h-[100dvh] w-full max-w-[680px] overflow-x-hidden bg-near-black px-6 text-warm-ivory"
      style={{
        paddingTop: "calc(env(safe-area-inset-top) + 32px)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 36px)",
      }}
    >
      <MotionPage>
        <header className="flex items-baseline justify-between">
          <BackButton fallbackHref="/account" />
          <Link
            href="/account"
            className="text-[16px] font-medium text-warm-ivory transition-colors duration-300 ease-atmospheric hover:text-warm-ivory/80"
          >
            Done
          </Link>
        </header>

        <section className="mt-6">
          <span className="text-[11px] uppercase tracking-editorial text-muted-gold">
            Intelligence
          </span>
          <h1 className="mt-2 font-serif text-[52px] italic leading-[1.0] tracking-[-0.01em] text-warm-ivory">
            The curation brain.
          </h1>
          <p className="mt-4 max-w-[40ch] font-serif text-[22px] italic leading-[1.25] text-warm-ivory/70">
            A small front room. A quiet back room. Controlled background thinking.
          </p>
        </section>

        <div className="my-8 h-px w-full" style={{ background: "rgba(255, 250, 240, 0.06)" }} />

        {/* Radar status card */}
        {radarStats ? (
          <section className="mb-6 rounded-2xl border border-white/[0.06] bg-white/[0.01] px-5 py-4">
            <h2 className="text-[11px] uppercase tracking-editorial text-muted-gold">
              Radar Status
            </h2>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <StatPill label="Active" value={radarStats.activeCount} cap={RADAR_ACTIVE_ITEM_LIMIT} />
              <StatPill label="Holding" value={radarStats.holdingCount} />
              <StatPill label="Min confidence" value={`${Math.round(RADAR_MIN_CONFIDENCE * 100)}%`} />
            </div>
            {lastRun ? (
              <p className="mt-3 text-[11px] text-warm-ivory/40">
                Last run{" "}
                {new Date(lastRun.created_at).toLocaleString()} ·{" "}
                {lastRun.selected_ids.length} selected · {lastRun.model}
                {lastFallbackReason ? ` · fallback: ${lastFallbackReason}` : ""}
                {inCooldown && nextAllowed
                  ? ` · next allowed ${nextAllowed.toLocaleTimeString()}`
                  : ""}
              </p>
            ) : null}
          </section>
        ) : null}

        {/* Refresh Radar */}
        <section className="rounded-2xl border border-white/[0.06] bg-white/[0.015] p-5">
          <h2 className="text-[11px] uppercase tracking-editorial text-muted-gold">
            Ambient Runs
          </h2>
          <p className="mt-2 text-[14px] leading-[1.55] text-warm-ivory/75">
            Owner-controlled passes for maintenance, discovery, weekend preview,
            Holding review, and cleanup. These are explicit/manual today and
            cron-ready later.
          </p>
          {inCooldown ? (
            <p className="mt-3 text-[12px] text-warm-ivory/45">
              Radar discovery ran recently — cooldown in effect.
            </p>
          ) : null}
          <div className="mt-5 grid grid-cols-2 gap-3">
            <IntelligenceRunButton
              runType="daily_maintenance"
              label="Run Daily Maintenance"
            />
            <IntelligenceRunButton
              runType="radar_discovery"
              label="Run Radar Discovery"
            />
            <IntelligenceRunButton
              runType="weekend_preview"
              label="Run Weekend Preview"
            />
            <IntelligenceRunButton
              runType="holding_review"
              label="Review Holding"
            />
            <IntelligenceRunButton
              runType="north_reflection"
              label="North Reflection"
            />
            <CleanRadarButton />
          </div>
          <div className="mt-5 border-t border-white/[0.05] pt-4">
            <RefreshRadarButton forceAllowed={isOwner} />
          </div>
        </section>

        {/* Holding / Later link */}
        <section className="mt-8">
          <Link
            href="/account/history#holding"
            className="flex items-center justify-between rounded-2xl border border-white/[0.06] bg-white/[0.01] px-5 py-4 transition-colors duration-300 ease-atmospheric hover:bg-white/[0.025]"
          >
            <div>
              <div className="text-[11px] uppercase tracking-editorial text-muted-gold">
                Holding / Later
              </div>
              <p className="mt-1 text-[14px] text-warm-ivory/75">
                Strong finds that aren&apos;t urgent right now.{" "}
                {radarStats?.holdingCount
                  ? `${radarStats.holdingCount} item${radarStats.holdingCount === 1 ? "" : "s"} waiting.`
                  : "Nothing in the back room yet."}
              </p>
            </div>
            <span className="text-warm-ivory/35">→</span>
          </Link>
        </section>

        {/* Services */}
        <section className="mt-10">
          <h2 className="text-[11px] uppercase tracking-editorial text-muted-gold">
            Services
          </h2>
          <ul className="mt-3 flex flex-col divide-y divide-white/[0.05] rounded-2xl border border-white/[0.06] bg-white/[0.01]">
            {services.map((s) => (
              <li
                key={s.label}
                className="flex items-center justify-between px-5 py-3"
              >
                <span className="text-[14px] text-warm-ivory/85">{s.label}</span>
                <span
                  className={
                    "text-[11px] uppercase tracking-editorial " +
                    (s.configured ? "text-[#7BC4A0]" : "text-warm-ivory/45")
                  }
                >
                  {s.configured ? "Configured" : "Missing key"}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* Recent runs */}
        {/* Last exploration lanes (Sprint 2.2) */}
        {lastRun ? (
          <LastExplorationPanel run={lastRun} />
        ) : null}

        <section className="mt-10">
          <h2 className="text-[11px] uppercase tracking-editorial text-muted-gold">
            Recent runs
          </h2>
          {recentRuns.length === 0 ? (
            <p className="mt-3 text-[13px] text-warm-ivory/45">
              No brain runs yet. Use Refresh Radar above to record the first one.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col divide-y divide-white/[0.05]">
              {recentRuns.map((run) => {
                const lanes = readLanesFromRun(run);
                const fallbackReason = readFallbackReasonFromRun(run);
                return (
                  <li key={run.id} className="py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[12px] uppercase tracking-editorial text-warm-ivory/65">
                        {run.run_type}
                      </span>
                      <span className="text-[11px] text-warm-ivory/45">
                        {new Date(run.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="mt-1 text-[12px] leading-[1.5] text-warm-ivory/55">
                      {run.input_summary ?? ""}
                    </p>
                    <div className="mt-1 text-[11px] text-warm-ivory/55">
                      {run.candidate_ids.length} shortlisted ·{" "}
                      {run.selected_ids.length} selected ·{" "}
                      {run.rejected_ids.length} rejected · {run.model}
                      {fallbackReason ? ` · fallback: ${fallbackReason}` : ""}
                      {readBudgetLineFromRun(run)}
                      {lanes.length > 0 ? ` · ${lanes.length} lanes` : ""}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </MotionPage>
    </main>
  );
}

function StatPill({
  label,
  value,
  cap,
}: {
  label: string;
  value: number | string;
  cap?: number;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] px-3 py-2 text-center">
      <div className="text-[18px] font-medium text-warm-ivory">
        {value}
        {cap != null ? (
          <span className="text-[12px] text-warm-ivory/40">/{cap}</span>
        ) : null}
      </div>
      <div className="text-[10px] uppercase tracking-editorial text-warm-ivory/45">
        {label}
      </div>
    </div>
  );
}

async function safeRecentRuns(): Promise<BrainDecisionRunRow[]> {
  try {
    const supabase = await getServerSupabase();
    const { data, error } = await supabase
      .from("brain_decision_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) {
      console.error("[surface-loader] account.intelligence.runs", error);
      return [];
    }
    return (data ?? []) as BrainDecisionRunRow[];
  } catch (error) {
    console.error("[surface-loader] account.intelligence.runs", error);
    return [];
  }
}

type LaneSummary = {
  id: string;
  title: string;
  mode: string;
  why_now: string;
  suggested_destination: string;
};

function readLanesFromRun(run: BrainDecisionRunRow): LaneSummary[] {
  const raw = run.raw_output as unknown;
  if (!raw || typeof raw !== "object") return [];
  const strategy = (raw as Record<string, unknown>).strategy;
  if (!strategy || typeof strategy !== "object") return [];
  const lanes = (strategy as Record<string, unknown>).lanes;
  if (!Array.isArray(lanes)) return [];
  return lanes
    .map((l) => {
      if (!l || typeof l !== "object") return null;
      const o = l as Record<string, unknown>;
      return {
        id: typeof o.id === "string" ? o.id : "?",
        title: typeof o.title === "string" ? o.title : "Lane",
        mode: typeof o.mode === "string" ? o.mode : "aligned",
        why_now: typeof o.why_now === "string" ? o.why_now : "",
        suggested_destination:
          typeof o.suggested_destination === "string"
            ? o.suggested_destination
            : "radar",
      };
    })
    .filter((x): x is LaneSummary => x !== null);
}

function readFallbackReasonFromRun(run: BrainDecisionRunRow): string | undefined {
  const raw = run.raw_output as unknown;
  if (!raw || typeof raw !== "object") return undefined;
  const topLevel = (raw as Record<string, unknown>).fallback_reason;
  if (typeof topLevel === "string" && topLevel.length > 0) return topLevel;
  const decision = (raw as Record<string, unknown>).decision;
  if (decision && typeof decision === "object") {
    const reason = (decision as Record<string, unknown>).fallbackReason;
    if (typeof reason === "string" && reason.length > 0) return reason;
  }
  const strategy = (raw as Record<string, unknown>).strategy;
  if (strategy && typeof strategy === "object") {
    const reason = (strategy as Record<string, unknown>).strategist_reason;
    if (typeof reason === "string" && reason.length > 0) return reason;
  }
  return undefined;
}

function readBudgetLineFromRun(run: BrainDecisionRunRow): string {
  const raw = run.raw_output as unknown;
  if (!raw || typeof raw !== "object") return "";
  const budget = (raw as Record<string, unknown>).budget;
  if (!budget || typeof budget !== "object") return "";
  const cost = (budget as Record<string, unknown>).estimated_run_cost_usd;
  const remaining = (budget as Record<string, unknown>).budget_remaining_usd;
  const parts = [
    typeof cost === "number" ? `$${cost.toFixed(3)} est` : null,
    typeof remaining === "number" ? `$${remaining.toFixed(2)} left` : null,
  ].filter(Boolean);
  return parts.length ? ` · ${parts.join(" · ")}` : "";
}

function LastExplorationPanel({ run }: { run: BrainDecisionRunRow }) {
  const lanes = readLanesFromRun(run);
  if (lanes.length === 0) {
    return (
      <section className="mt-10">
        <h2 className="text-[11px] uppercase tracking-editorial text-muted-gold">
          Last exploration
        </h2>
        <p className="mt-2 text-[13px] text-warm-ivory/45">
          The Strategist returned no lanes for the last run. Quiet is valid.
        </p>
      </section>
    );
  }
  return (
    <section className="mt-10">
      <h2 className="text-[11px] uppercase tracking-editorial text-muted-gold">
        Last exploration
      </h2>
      <p className="mt-2 text-[12px] text-warm-ivory/45">
        What Jarvis chose to be curious about on the last refresh.
      </p>
      <ul className="mt-3 flex flex-col divide-y divide-white/[0.05] rounded-2xl border border-white/[0.06] bg-white/[0.01]">
        {lanes.map((lane) => (
          <li key={lane.id} className="px-5 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] text-warm-ivory/85">
                {lane.title}
              </span>
              <span
                className={
                  "text-[10px] uppercase tracking-editorial " +
                  (lane.mode === "aligned"
                    ? "text-[#7BC4A0]"
                    : lane.mode === "adjacent"
                      ? "text-muted-gold"
                      : "text-[#9AB6E2]")
                }
              >
                {lane.mode} → {lane.suggested_destination}
              </span>
            </div>
            {lane.why_now ? (
              <p className="mt-1 text-[11px] leading-[1.5] text-warm-ivory/55">
                {lane.why_now}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

async function safeRadarStats(): Promise<{
  activeCount: number;
  holdingCount: number;
} | null> {
  try {
    const supabase = await getServerSupabase();
    const [activeRes, holdingRes] = await Promise.all([
      supabase
        .from("surfaced_items")
        .select("id", { count: "exact", head: true })
        .eq("destination", "radar")
        .eq("status", "shown"),
      supabase
        .from("surfaced_items")
        .select("id", { count: "exact", head: true })
        .eq("destination", "holding")
        .in("status", ["discovered", "shown"]),
    ]);
    return {
      activeCount: activeRes.count ?? 0,
      holdingCount: holdingRes.count ?? 0,
    };
  } catch {
    return null;
  }
}
