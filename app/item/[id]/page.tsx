import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getIndexItem } from "@/lib/index/repo";
import { BackButton, MotionPage } from "@/components";
import {
  ItemActionButton,
  GeneratePlanButton,
  RefreshBriefingButton,
} from "./client-bits";
import type { IndexedItem, IndexItemStatus } from "@/lib/index/types";
import type { ItemBriefing } from "@/lib/brain/briefingTypes";

export const metadata = { title: "Item · Jarvis" };
export const dynamic = "force-dynamic";

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=/item/${encodeURIComponent(id)}`);

  const item = await getIndexItem(id);
  if (!item) notFound();

  const briefing = item.briefing ?? fallbackBriefing(item);
  const evidence = readEvidence(item);
  const planContext = readPlanContext(item);
  const formattedStart = formatDateTime(item.startsAt);
  const formattedEnd = formatDateTime(item.endsAt);
  const formattedExpires = formatDateTime(item.expiresAt);
  const showActions = !["completed", "expired"].includes(item.status);

  return (
    <main
      className="smooth-page mx-auto min-h-[100dvh] w-full max-w-[680px] overflow-x-hidden bg-near-black px-6 text-warm-ivory"
      style={{
        paddingTop: "calc(env(safe-area-inset-top) + 32px)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 48px)",
      }}
    >
      <MotionPage>
        <header className="flex items-baseline justify-between">
          <BackButton fallbackHref="/account/history" />
          <Link
            href="/account/history"
            className="text-[12px] uppercase tracking-editorial text-warm-ivory/55 transition-colors duration-300 ease-atmospheric hover:text-warm-ivory/80"
          >
            History
          </Link>
        </header>

        {/* Hero */}
        <section className="mt-6">
          <div className="flex items-center gap-3">
            <CategoryPill label={briefing.display_category} />
            <StatusPill status={item.status} />
            <DestinationPill destination={item.destination} />
            <ConfidencePill label={briefing.confidence_label} />
          </div>
          <h1 className="mt-4 font-serif text-[40px] leading-[1.05] tracking-[-0.01em] text-warm-ivory">
            {briefing.display_title}
          </h1>
          {briefing.one_line ? (
            <p className="mt-2 max-w-[44ch] text-[15px] leading-[1.5] text-warm-ivory/70">
              {briefing.one_line}
            </p>
          ) : null}
        </section>

        {item.imageUrl ? (
          <section className="mt-6 overflow-hidden rounded-2xl border border-white/[0.06]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.imageUrl}
              alt={item.title}
              className="h-auto w-full object-cover"
              loading="lazy"
            />
          </section>
        ) : null}

        <section className="mt-8">
          <SectionLabel>Jarvis Take</SectionLabel>
          <p className="mt-3 text-[17px] leading-[1.55] text-warm-ivory/82">
            {briefing.jarvis_take}
          </p>
        </section>

        <section className="mt-8">
          <SectionLabel>Why It Matters</SectionLabel>
          <p className="mt-3 text-[15px] leading-[1.55] text-warm-ivory/75">
            {briefing.why_it_matters}
          </p>
        </section>

        <section className="mt-8 rounded-2xl border border-muted-gold/20 bg-muted-gold/[0.03] px-5 py-4">
          <div className="text-[11px] uppercase tracking-editorial text-muted-gold">
            Best Next Action
          </div>
          <p className="mt-2 text-[15px] leading-[1.5] text-warm-ivory/82">
            {formatBestNextAction(briefing.best_next_action)}
          </p>
          {!item.briefing ? (
            <div className="mt-3">
              <RefreshBriefingButton itemId={item.id} />
            </div>
          ) : null}
        </section>

        {/* Practical Fit */}
        <section className="mt-8">
          <SectionLabel>Practical Fit</SectionLabel>
          <dl className="mt-3 flex flex-col divide-y divide-white/[0.05] rounded-2xl border border-white/[0.06] bg-white/[0.01]">
            <DetailRow label="Effort" value={briefing.effort_level} />
            <DetailRow label="Spend" value={briefing.spending_posture} />
            <DetailRow label="Confidence" value={`${briefing.confidence_label} · ${Math.round(briefing.confidence * 100)} / 100`} />
            {formattedStart ? (
              <DetailRow label="Starts" value={formattedStart} />
            ) : null}
            {formattedEnd ? (
              <DetailRow label="Ends" value={formattedEnd} />
            ) : null}
            {formattedExpires ? (
              <DetailRow label="Expires" value={formattedExpires} />
            ) : null}
            {item.locationName ? (
              <DetailRow
                label="Where"
                value={
                  item.address ? (
                    <span>
                      {item.locationName}
                      <br />
                      <span className="text-warm-ivory/55">{item.address}</span>
                    </span>
                  ) : (
                    item.locationName
                  )
                }
              />
            ) : null}
            {item.score != null ? (
              <DetailRow
                label="Score"
                value={`${Math.round(item.score * 100)} / 100`}
              />
            ) : null}
          </dl>
        </section>

        {/* Source evidence */}
        {evidence ? (
          <section className="mt-8">
            <SectionLabel>Source Evidence</SectionLabel>
            <div className="mt-3 rounded-2xl border border-white/[0.06] bg-white/[0.01] px-5 py-4">
              <div className="text-[11px] uppercase tracking-editorial text-warm-ivory/55">
                {evidence.label}
              </div>
              <p className="mt-2 text-[14px] leading-[1.5] text-warm-ivory/75">
                {briefing.evidence_summary}
              </p>
              {evidence.sourceTitle ? (
                <div className="mt-2 text-[14px] leading-[1.4] text-warm-ivory/85">
                  {evidence.sourceTitle}
                </div>
              ) : null}
              {evidence.domain ? (
                <div className="mt-1 text-[12px] text-warm-ivory/55">
                  {evidence.domain}
                </div>
              ) : null}
              {evidence.url ? (
                <a
                  href={evidence.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-muted-gold transition-colors duration-300 ease-atmospheric hover:text-muted-gold/80"
                >
                  Open original →
                </a>
              ) : null}
            </div>
          </section>
        ) : null}

        {briefing.cleaned_tags.length > 0 ? (
          <section className="mt-8">
            <SectionLabel>Clean Tags</SectionLabel>
            <div className="mt-3 flex flex-wrap gap-2">
              {briefing.cleaned_tags.slice(0, 8).map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-white/[0.06] bg-white/[0.02] px-3 py-1 text-[11px] text-warm-ivory/65"
                >
                  {t}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        {/* Plan seam */}
        <section className="mt-8">
          <SectionLabel>Plan</SectionLabel>
          {planContext.planSlug || planContext.planId ? (
            <div className="mt-3 rounded-2xl border border-muted-gold/20 bg-muted-gold/[0.03] px-4 py-4">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <span className="text-[11px] uppercase tracking-editorial text-muted-gold">
                  Plan attached
                </span>
                {planContext.planStatus ? (
                  <span className="text-[10px] uppercase tracking-editorial text-warm-ivory/45">
                    {planContext.planStatus}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-3">
              <Link
                href={
                  planContext.planSlug
                    ? `/plan/${planContext.planSlug}`
                    : `/plan/sparrow`
                }
                className="inline-flex items-center justify-center rounded-full border border-muted-gold/50 bg-muted-gold/10 px-5 py-2 text-[12px] uppercase tracking-editorial text-muted-gold transition-colors duration-300 ease-atmospheric hover:bg-muted-gold/20"
              >
                {planContext.planStatus === "active"
                  ? "View Active Plan"
                  : planContext.planStatus === "completed"
                    ? "View Completed Plan"
                    : "View Plan"}
              </Link>
              {showActions && planContext.planStatus !== "completed" ? (
                <GeneratePlanButton
                  itemId={item.id}
                  label="Regenerate"
                  force
                />
              ) : null}
              </div>
            </div>
          ) : showActions ? (
            <div className="mt-3 flex items-center gap-3">
              <GeneratePlanButton itemId={item.id} />
              <span className="text-[11px] text-warm-ivory/45">
                Generates a draft plan you can review or activate.
              </span>
            </div>
          ) : (
            <p className="mt-3 text-[13px] text-warm-ivory/45">
              No active plan for this item.
            </p>
          )}
        </section>

        {/* Actions */}
        {showActions ? (
          <section className="mt-10">
            <SectionLabel>Actions</SectionLabel>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {item.status !== "saved" ? (
                <ItemActionButton
                  itemId={item.id}
                  action="save"
                  label="Save"
                  variant="primary"
                />
              ) : null}
              {item.status !== "passed" ? (
                <ItemActionButton
                  itemId={item.id}
                  action="pass"
                  label="Pass"
                  variant="secondary"
                />
              ) : null}
              {item.destination !== "upcoming" ? (
                <ItemActionButton
                  itemId={item.id}
                  action="add-upcoming"
                  label="Add to Upcoming"
                  variant="secondary"
                />
              ) : (
                <ItemActionButton
                  itemId={item.id}
                  action="remove-upcoming"
                  label="Remove from Upcoming"
                  variant="ghost"
                />
              )}
              {item.destination !== "radar" ? (
                <ItemActionButton
                  itemId={item.id}
                  action="move-radar"
                  label="Move to Radar"
                  variant="secondary"
                />
              ) : null}
              {item.destination !== "holding" ? (
                <ItemActionButton
                  itemId={item.id}
                  action="move-holding"
                  label="Move to Holding"
                  variant="secondary"
                />
              ) : null}
              {item.status !== "completed" ? (
                <ItemActionButton
                  itemId={item.id}
                  action="complete"
                  label="Mark complete"
                  variant="secondary"
                />
              ) : null}
              {item.status !== "archived" ? (
                <ItemActionButton
                  itemId={item.id}
                  action="archive"
                  label="Archive"
                  variant="danger"
                />
              ) : null}
            </div>
          </section>
        ) : (
          <section className="mt-10">
            <SectionLabel>Actions</SectionLabel>
            <div className="mt-3">
              <ItemActionButton
                itemId={item.id}
                action="restore"
                label="Restore"
                variant="secondary"
              />
            </div>
          </section>
        )}

        <details className="mt-12 rounded-2xl border border-white/[0.06] bg-white/[0.01] px-4 py-3 text-[11px] text-warm-ivory/40">
          <summary className="cursor-pointer uppercase tracking-editorial text-warm-ivory/45">
            Debug metadata
          </summary>
          <div className="mt-3 space-y-3">
            {item.reasons.length > 0 ? (
              <div>
                <div className="text-warm-ivory/55">reasons</div>
                <ul className="mt-1 list-inside list-disc">
                  {item.reasons.slice(0, 8).map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {item.tags.length > 0 ? (
              <div>
                <div className="text-warm-ivory/55">tags</div>
                <div className="mt-1">{item.tags.join(", ")}</div>
              </div>
            ) : null}
            <div>id · {item.id}</div>
            <div>
              updated · {new Date(item.updatedAt).toLocaleString()} · created ·{" "}
              {new Date(item.createdAt).toLocaleString()}
            </div>
          </div>
        </details>
      </MotionPage>
    </main>
  );
}

// ── UI atoms ─────────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] uppercase tracking-editorial text-muted-gold">
      {children}
    </h2>
  );
}

function CategoryPill({ label }: { label: string }) {
  return (
    <span className="rounded-md border border-muted-gold/30 px-2 py-0.5 text-[10px] uppercase tracking-editorial text-muted-gold">
      {label.toUpperCase()}
    </span>
  );
}

const STATUS_COLOR: Record<IndexItemStatus, string> = {
  discovered: "text-warm-ivory/55 border-white/[0.10]",
  shown: "text-[#7BC4A0] border-[#7BC4A0]/40",
  opened: "text-warm-ivory/75 border-white/[0.15]",
  saved: "text-muted-gold border-muted-gold/40",
  passed: "text-warm-ivory/35 border-white/[0.06]",
  planned: "text-[#9AB6E2] border-[#9AB6E2]/40",
  completed: "text-warm-ivory/55 border-white/[0.08]",
  expired: "text-warm-ivory/35 border-white/[0.06]",
  archived: "text-warm-ivory/35 border-white/[0.06]",
};

function StatusPill({ status }: { status: IndexItemStatus }) {
  return (
    <span
      className={
        "rounded-md border px-2 py-0.5 text-[10px] uppercase tracking-editorial " +
        (STATUS_COLOR[status] ?? "text-warm-ivory/55 border-white/[0.10]")
      }
    >
      {status}
    </span>
  );
}

function DestinationPill({ destination }: { destination: string }) {
  return (
    <span className="rounded-md border border-white/[0.08] px-2 py-0.5 text-[10px] uppercase tracking-editorial text-warm-ivory/55">
      {destination}
    </span>
  );
}

function ConfidencePill({ label }: { label: ItemBriefing["confidence_label"] }) {
  return (
    <span className="rounded-md border border-white/[0.08] px-2 py-0.5 text-[10px] uppercase tracking-editorial text-warm-ivory/55">
      {label}
    </span>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-3">
      <dt className="text-[12px] uppercase tracking-editorial text-warm-ivory/50">
        {label}
      </dt>
      <dd className="text-right text-[13px] text-warm-ivory/85">{value}</dd>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

type EvidenceSummary = {
  label: string;
  domain?: string;
  url?: string;
  sourceTitle?: string;
};

function readEvidence(item: IndexedItem): EvidenceSummary | null {
  const raw = isRecord(item.rawPayload) ? item.rawPayload : {};
  const url =
    item.url ??
    (typeof raw.source_url === "string" ? raw.source_url : undefined) ??
    (typeof raw.url === "string" ? raw.url : undefined);
  const sourceTitle =
    typeof raw.source_title === "string" ? raw.source_title : undefined;
  const leadName = typeof raw.lead_name === "string" ? raw.lead_name : null;

  if (!url && !sourceTitle && !leadName) {
    // No web/article evidence — fall back to the source name itself
    if (!item.source) return null;
    return { label: `Source · ${item.source}` };
  }

  const domain = url ? safeDomain(url) : undefined;
  const label = leadName
    ? "Lead from source"
    : `Source · ${domain ?? item.source ?? "web"}`;

  return { label, domain, url, sourceTitle };
}

function fallbackBriefing(item: IndexedItem): ItemBriefing {
  const confidence = clamp01(item.score ?? 0.5);
  const raw = isRecord(item.rawPayload) ? item.rawPayload : {};
  const sourceTitle =
    typeof raw.source_title === "string" ? raw.source_title : undefined;
  const cleanedTags = item.tags
    .filter((tag) => !isInternalTag(tag))
    .map((tag) => tag.replace(/[_:]/g, " "))
    .slice(0, 8);
  return {
    display_title: cleanDisplayText(item.title || sourceTitle || "Untitled"),
    display_category: cleanDisplayText(item.category ?? item.type ?? "Item"),
    one_line:
      cleanDisplayText(item.description ?? item.subtitle ?? "") ||
      "Worth a closer look, but the briefing has not been fully edited yet.",
    jarvis_take:
      cleanDisplayText(item.reasons[0] ?? "") ||
      (item.destination === "holding"
        ? "Good signal, not urgent. Keep it for later."
        : "Worth attention now if the source checks out."),
    why_it_matters:
      cleanDisplayText(item.reasons[1] ?? "") ||
      "It matched enough of the current taste profile to keep on the board.",
    why_now: cleanDisplayText(item.startsAt ? formatDateTime(item.startsAt) ?? "" : ""),
    best_next_action: item.destination === "holding" ? "hold" : "save",
    confidence,
    confidence_label: confidence >= 0.74 ? "high" : confidence >= 0.5 ? "medium" : "low",
    effort_level: item.tags.includes("high-effort") ? "high" : "low",
    spending_posture: item.tags.includes("paid") || item.tags.includes("ticketed")
      ? "paid"
      : "unknown",
    suggested_destination:
      item.destination === "holding" ? "holding" : item.destination === "radar" ? "radar" : "discovered",
    quality_flags: [],
    evidence_summary: sourceTitle
      ? `Original source: ${cleanDisplayText(sourceTitle)}.`
      : "No edited source summary yet.",
    cleaned_tags: cleanedTags,
  };
}

function formatBestNextAction(action: ItemBriefing["best_next_action"]): string {
  const map: Record<ItemBriefing["best_next_action"], string> = {
    save: "Save it if you want this in the active pile.",
    pass: "Pass. This is not worth keeping in view.",
    hold: "Hold, don't act yet.",
    plan: "Worth planning if the timing fits.",
    research: "Needs verification before it deserves action.",
    ignore: "Ignore. Not worth active attention.",
  };
  return map[action];
}

function cleanDisplayText(value: string): string {
  return value
    .replace(/Strategist lane:\s*[^.]+\.?/gi, "")
    .replace(/Query:\s*"[^"]+"\s*/gi, "")
    .replace(/\b(seed|lane|local-radar):[\w:-]+\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isInternalTag(tag: string): boolean {
  return (
    tag.startsWith("seed:") ||
    tag.startsWith("lane:") ||
    tag.startsWith("mode:") ||
    tag === "strategist-lane" ||
    tag === "local-radar" ||
    tag === "web-result" ||
    tag.includes(":")
  );
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

type PlanContext = {
  planId?: string;
  planSlug?: string;
  planStatus?: string;
};

function readPlanContext(item: IndexedItem): PlanContext {
  const raw = isRecord(item.rawPayload) ? item.rawPayload : {};
  const planId = typeof raw.plan_id === "string" ? raw.plan_id : undefined;
  const planSlug = typeof raw.plan_slug === "string" ? raw.plan_slug : undefined;
  const planStatus =
    typeof raw.plan_status === "string"
      ? raw.plan_status
      : item.tags.find((t) => t.startsWith("plan:"))?.slice(5);
  return { planId, planSlug, planStatus };
}

function safeDomain(url: string): string | undefined {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function formatDateTime(iso?: string | null): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
