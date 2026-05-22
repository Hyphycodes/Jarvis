import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  Calendar,
  Car,
  ChevronDown,
  Clock,
  Compass,
  ExternalLink,
  Eye,
  Flag,
  Gem,
  MapPin,
  Package,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { getIndexItem } from "@/lib/index/repo";
import {
  buildConsiderationBrief,
  type ConsiderationBriefView,
  type ConsiderationPrimaryAction,
  type ConsiderationTone,
} from "@/lib/items/considerationBrief";
import { BackButton, MotionPage } from "@/components";
import {
  ItemActionButton,
  GeneratePlanButton,
  RefreshBriefingButton,
} from "./client-bits";
import type { IndexedItem } from "@/lib/index/types";

export const metadata = { title: "Consideration Brief · Jarvis" };
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

  const brief = buildConsiderationBrief(item);
  const planContext = readPlanContext(item);
  const showActions = !["completed", "expired"].includes(item.status);
  const showDebug = user.role === "owner";

  return (
    <main
      className="smooth-page mx-auto min-h-[100dvh] w-full max-w-[680px] overflow-x-hidden bg-near-black px-5 text-warm-ivory"
      style={{
        paddingTop: "calc(env(safe-area-inset-top) + 24px)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 48px)",
      }}
    >
      <MotionPage>
        <TopBar />

        <section className="mt-8">
          <VerdictPill label={brief.verdictLabel} tone={brief.verdictTone} />
          <h1 className="mt-5 font-serif text-[46px] leading-[0.98] tracking-[-0.01em] text-warm-ivory sm:text-[56px]">
            {brief.title}
          </h1>
          <p className="mt-4 max-w-[42ch] text-[18px] leading-[1.45] text-warm-ivory/68">
            {brief.oneLine}
          </p>
        </section>

        <HeroMedia media={brief.media} title={brief.title} />

        <QuickFacts facts={brief.facts} />

        <BestMoveCard brief={brief} />

        <IndicatorPanel indicators={brief.indicators.slice(0, 4)} />

        {brief.whyItMatters.length > 0 ? (
          <EditorialSection title="Why It Matters">
            <div className="divide-y divide-white/[0.06]">
              {brief.whyItMatters.map((reason) => (
                <ReasonRow key={reason.title} reason={reason} />
              ))}
            </div>
          </EditorialSection>
        ) : null}

        {brief.practicalFit.length > 0 ? (
          <EditorialSection title="Practical Fit">
            <div className="divide-y divide-white/[0.06] rounded-2xl border border-white/[0.08] bg-white/[0.018]">
              {brief.practicalFit.map((row) => (
                <PracticalRow key={`${row.label}-${row.value}`} row={row} />
              ))}
            </div>
          </EditorialSection>
        ) : null}

        {brief.location ? <LocationModule location={brief.location} /> : null}

        {brief.valueSignal ? <ValueSignal signal={brief.valueSignal} /> : null}

        {brief.sourceEvidence ? (
          <SourceEvidence evidence={brief.sourceEvidence} />
        ) : null}

        {brief.cleanTags.length > 0 ? <CleanTags tags={brief.cleanTags} /> : null}

        <ActionsPanel
          brief={brief}
          item={item}
          showActions={showActions}
          planContext={planContext}
        />

        {!item.briefing ? (
          <section className="mt-5 rounded-2xl border border-white/[0.06] bg-white/[0.012] px-4 py-4">
            <p className="text-[13px] leading-[1.5] text-warm-ivory/48">
              This item is using a local fallback brief. Refresh only when you
              want Jarvis to rewrite the decision frame.
            </p>
            <div className="mt-3">
              <RefreshBriefingButton itemId={item.id} />
            </div>
          </section>
        ) : null}

        {showDebug ? <DebugMetadata debug={brief.debug} /> : null}
      </MotionPage>
    </main>
  );
}

function TopBar() {
  return (
    <header className="grid grid-cols-[44px_1fr_44px] items-center">
      <BackButton fallbackHref="/radar" />
      <div className="text-center text-[11px] uppercase tracking-[0.36em] text-muted-gold">
        Consideration Brief
      </div>
      <Link
        href="/account/history"
        aria-label="History"
        className="inline-flex h-10 w-10 items-center justify-center justify-self-end text-warm-ivory/55 transition-colors duration-300 ease-atmospheric hover:text-warm-ivory"
      >
        <Clock size={19} strokeWidth={1.4} />
      </Link>
    </header>
  );
}

function VerdictPill({
  label,
  tone,
}: {
  label: string;
  tone: ConsiderationTone;
}) {
  const color =
    tone === "positive"
      ? "border-muted-gold/55 text-muted-gold"
      : tone === "caution"
        ? "border-[#D8A85B]/45 text-[#D8A85B]"
        : tone === "negative"
          ? "border-[#E07A6E]/45 text-[#E07A6E]"
          : "border-white/[0.18] text-warm-ivory/70";
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border bg-white/[0.018] px-4 py-2 text-[11px] uppercase tracking-[0.32em] ${color}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

function HeroMedia({
  media,
  title,
}: {
  media: ConsiderationBriefView["media"];
  title: string;
}) {
  return (
    <section className="mt-7 overflow-hidden rounded-[1.35rem] border border-white/[0.08] bg-[#101011] shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
      {media.heroUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={media.heroUrl}
          alt={title}
          className="aspect-[1.52] w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div
          aria-hidden
          className={`relative aspect-[1.52] overflow-hidden ${placeholderClass(media.placeholderKind)}`}
        >
          <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(214,168,91,0.16),transparent_38%),radial-gradient(circle_at_72%_38%,rgba(255,255,255,0.12),transparent_16%),linear-gradient(180deg,#171719,#080809)]" />
          <div className="absolute inset-x-8 bottom-8 h-px bg-muted-gold/20" />
          <div className="absolute bottom-6 left-8 text-[10px] uppercase tracking-[0.36em] text-muted-gold/65">
            {media.placeholderKind}
          </div>
        </div>
      )}
    </section>
  );
}

function placeholderClass(kind: ConsiderationBriefView["media"]["placeholderKind"]) {
  switch (kind) {
    case "event":
      return "bg-[radial-gradient(circle_at_30%_30%,rgba(80,88,120,0.28),transparent_36%)]";
    case "place":
      return "bg-[radial-gradient(circle_at_28%_40%,rgba(114,91,57,0.34),transparent_36%)]";
    case "product":
      return "bg-[radial-gradient(circle_at_50%_38%,rgba(173,132,65,0.28),transparent_34%)]";
    case "activity":
      return "bg-[radial-gradient(circle_at_60%_30%,rgba(91,120,84,0.22),transparent_38%)]";
    case "idea":
      return "bg-[radial-gradient(circle_at_35%_36%,rgba(120,99,73,0.24),transparent_40%)]";
    case "general":
      return "bg-charcoal";
  }
}

function QuickFacts({ facts }: { facts: ConsiderationBriefView["facts"] }) {
  return (
    <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
      {facts.map((fact) => (
        <div
          key={`${fact.label}-${fact.value}`}
          className="min-h-[86px] border-l border-white/[0.08] px-3 py-2"
        >
          <div className="flex items-center gap-2 text-muted-gold/75">
            {iconFor(fact.icon, 16)}
            <span className="text-[9px] uppercase tracking-[0.24em] text-warm-ivory/42">
              {fact.label}
            </span>
          </div>
          <div className="mt-2 text-[14px] leading-[1.25] text-warm-ivory/82">
            {fact.value}
          </div>
        </div>
      ))}
    </section>
  );
}

function BestMoveCard({ brief }: { brief: ConsiderationBriefView }) {
  return (
    <section className="mt-7 rounded-[1.35rem] border border-muted-gold/20 bg-[linear-gradient(135deg,rgba(214,168,91,0.08),rgba(255,255,255,0.015)_46%,rgba(0,0,0,0.1))] px-5 py-5">
      <div className="grid grid-cols-[56px_1fr] gap-5">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-muted-gold/35 text-muted-gold">
          <Sparkles size={24} strokeWidth={1.35} />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.28em] text-muted-gold">
            Best Move
          </div>
          <h2 className="mt-2 font-serif text-[28px] leading-[1.06] text-warm-ivory">
            {brief.bestMoveTitle}
          </h2>
          <p className="mt-2 max-w-[34ch] text-[15px] leading-[1.48] text-warm-ivory/68">
            {brief.bestMoveBody}
          </p>
        </div>
      </div>
    </section>
  );
}

function IndicatorPanel({
  indicators,
}: {
  indicators: ConsiderationBriefView["indicators"];
}) {
  if (indicators.length === 0) return null;
  return (
    <EditorialSection title="Why Consider It">
      <div className="space-y-4">
        {indicators.map((indicator) => (
          <div
            key={indicator.key}
            className="grid grid-cols-[24px_1fr] items-center gap-x-4 gap-y-1 sm:grid-cols-[24px_150px_1fr_140px]"
          >
            <div className="flex h-6 w-6 items-center justify-center rounded-full border border-muted-gold/40 text-muted-gold">
              {iconFor(indicator.key, 13)}
            </div>
            <div className="text-[10px] uppercase tracking-[0.26em] text-warm-ivory/58">
              {indicator.label}
            </div>
            <div className="col-span-2 h-px bg-white/[0.08] sm:col-span-1">
              <div
                className="h-px bg-muted-gold"
                style={{ width: `${Math.max(12, Math.round((indicator.score ?? 0.5) * 100))}%` }}
              />
            </div>
            <div className="col-start-2 text-[13px] text-warm-ivory/64 sm:col-start-auto sm:text-right">
              {indicator.valueLabel}
            </div>
          </div>
        ))}
      </div>
    </EditorialSection>
  );
}

function EditorialSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <div className="mb-4 grid grid-cols-[auto_1fr] items-center gap-4">
        <h2 className="text-[11px] uppercase tracking-[0.34em] text-warm-ivory/78">
          {title}
        </h2>
        <div className="h-px bg-white/[0.07]" />
      </div>
      {children}
    </section>
  );
}

function ReasonRow({
  reason,
}: {
  reason: ConsiderationBriefView["whyItMatters"][number];
}) {
  return (
    <div className="grid grid-cols-[30px_1fr] gap-4 py-4">
      <div className="pt-1 text-muted-gold">{iconFor(reason.icon, 20)}</div>
      <div>
        <h3 className="font-serif text-[20px] leading-[1.18] text-warm-ivory">
          {reason.title}
        </h3>
        <p className="mt-1 text-[14px] leading-[1.5] text-warm-ivory/62">
          {reason.body}
        </p>
      </div>
    </div>
  );
}

function PracticalRow({
  row,
}: {
  row: ConsiderationBriefView["practicalFit"][number];
}) {
  return (
    <div className="grid grid-cols-[28px_1fr_auto] gap-3 px-4 py-4">
      <div className="text-muted-gold/75">{iconFor(row.icon, 18)}</div>
      <div className="text-[13px] text-warm-ivory/58">
        {row.label}
        {row.detail ? (
          <div className="mt-1 text-[12px] leading-[1.35] text-warm-ivory/38">
            {row.detail}
          </div>
        ) : null}
      </div>
      <div className="max-w-[150px] text-right text-[14px] leading-[1.35] text-warm-ivory/82">
        {row.value}
      </div>
    </div>
  );
}

function LocationModule({
  location,
}: {
  location: NonNullable<ConsiderationBriefView["location"]>;
}) {
  return (
    <section className="mt-8 overflow-hidden rounded-[1.35rem] border border-white/[0.08] bg-white/[0.014]">
      <div className="grid min-h-[172px] grid-cols-1 sm:grid-cols-[0.88fr_1.12fr]">
        <div className="p-5">
          <div className="text-[10px] uppercase tracking-[0.32em] text-muted-gold">
            Location
          </div>
          <h2 className="mt-6 font-serif text-[24px] leading-[1.08] text-warm-ivory">
            {location.neighborhood ?? location.label ?? location.city ?? "Location"}
          </h2>
          {location.address || location.city ? (
            <p className="mt-3 text-[14px] leading-[1.5] text-warm-ivory/62">
              {[location.address, location.city].filter(Boolean).join(" · ")}
            </p>
          ) : null}
          {location.mapsUrl ? (
            <a
              href={location.mapsUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-4 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-muted-gold transition-colors duration-300 ease-atmospheric hover:text-soft-gold"
            >
              Open in Maps <ExternalLink size={13} />
            </a>
          ) : null}
        </div>
        <div className="relative min-h-[164px] overflow-hidden bg-[#101011]">
          <div className="absolute inset-0 opacity-70 [background-image:linear-gradient(rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.045)_1px,transparent_1px)] [background-size:28px_28px]" />
          <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center text-muted-gold">
            <MapPin size={38} fill="currentColor" strokeWidth={1.2} />
            <div className="mt-2 text-[11px] uppercase tracking-[0.34em] text-warm-ivory/72">
              {location.city ?? "Map"}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ValueSignal({
  signal,
}: {
  signal: NonNullable<ConsiderationBriefView["valueSignal"]>;
}) {
  return (
    <section className="mt-5 rounded-[1.35rem] border border-white/[0.08] bg-white/[0.014] px-5 py-5">
      <div className="grid grid-cols-[54px_1fr_auto] items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-muted-gold/35 text-muted-gold">
          <Gem size={24} strokeWidth={1.25} />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-muted-gold">
            {signal.label}
          </div>
          <h2 className="mt-1 font-serif text-[22px] leading-[1.1] text-warm-ivory">
            {signal.score ? "Signal is worth tracking." : "Quiet upside."}
          </h2>
          <p className="mt-1 text-[14px] leading-[1.45] text-warm-ivory/62">
            {signal.body}
          </p>
        </div>
        {signal.score ? (
          <div className="flex h-16 w-16 flex-col items-center justify-center rounded-full border border-muted-gold/35 text-muted-gold">
            <span className="font-serif text-[22px] leading-none">
              {signal.score.toFixed(1)}
            </span>
            <span className="mt-1 text-[8px] uppercase tracking-[0.22em]">
              upside
            </span>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function SourceEvidence({
  evidence,
}: {
  evidence: NonNullable<ConsiderationBriefView["sourceEvidence"]>;
}) {
  return (
    <section className="mt-10 rounded-[1.35rem] border border-white/[0.08] bg-white/[0.014] px-5 py-5">
      <div className="grid grid-cols-[54px_1fr] gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-muted-gold/35 text-muted-gold">
          <Flag size={22} strokeWidth={1.25} />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-muted-gold">
            Source Evidence
          </div>
          <h2 className="mt-2 font-serif text-[26px] leading-[1.08] text-warm-ivory">
            {evidence.domain ?? evidence.title ?? "Original source"}
          </h2>
          {evidence.summary ? (
            <p className="mt-2 text-[15px] leading-[1.5] text-warm-ivory/64">
              {evidence.summary}
            </p>
          ) : null}
          {evidence.qualityLabel ? (
            <div className="mt-4 flex items-center gap-2 text-[13px] text-warm-ivory/56">
              <Eye size={16} className="text-muted-gold" strokeWidth={1.4} />
              {evidence.qualityLabel}
            </div>
          ) : null}
          {evidence.title ? (
            <div className="mt-3 text-[12px] leading-[1.4] text-warm-ivory/42">
              {evidence.title}
            </div>
          ) : null}
          {evidence.url ? (
            <a
              href={evidence.url}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-4 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-muted-gold transition-colors duration-300 ease-atmospheric hover:text-soft-gold"
            >
              Open original <ExternalLink size={13} />
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function CleanTags({ tags }: { tags: string[] }) {
  return (
    <section className="mt-9">
      <div className="mb-3 text-[11px] uppercase tracking-[0.34em] text-warm-ivory/68">
        Clean Tags
      </div>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full border border-muted-gold/25 px-3 py-1.5 text-[12px] text-warm-ivory/68"
          >
            {tag}
          </span>
        ))}
      </div>
    </section>
  );
}

function ActionsPanel({
  brief,
  item,
  showActions,
  planContext,
}: {
  brief: ConsiderationBriefView;
  item: IndexedItem;
  showActions: boolean;
  planContext: PlanContext;
}) {
  return (
    <section className="mt-10">
      <div className="mb-4 text-[11px] uppercase tracking-[0.34em] text-warm-ivory/68">
        Actions
      </div>
      {planContext.planSlug || planContext.planId ? (
        <Link
          href={planContext.planSlug ? `/plan/${planContext.planSlug}` : "/plan/sparrow"}
          className="mb-3 flex min-h-[56px] items-center justify-center rounded-2xl border border-muted-gold/35 bg-muted-gold/[0.08] px-5 text-[11px] uppercase tracking-[0.28em] text-muted-gold transition-colors duration-300 ease-atmospheric hover:bg-muted-gold/[0.14]"
        >
          View Plan
        </Link>
      ) : null}

      {showActions ? (
        <div className="space-y-3">
          <PrimaryAction itemId={item.id} action={brief.primaryAction} />
          <div className="grid gap-3">
            {brief.primaryAction !== "save" && item.status !== "saved" ? (
              <ItemActionButton itemId={item.id} action="save" label="Save" variant="secondary" />
            ) : null}
            {brief.primaryAction !== "hold" && item.destination !== "holding" ? (
              <ItemActionButton
                itemId={item.id}
                action="move-holding"
                label="Move to Holding"
                variant="secondary"
              />
            ) : null}
            {brief.primaryAction !== "upcoming" && item.destination !== "upcoming" ? (
              <ItemActionButton
                itemId={item.id}
                action="add-upcoming"
                label="Add to Upcoming"
                variant="secondary"
              />
            ) : null}
            {brief.primaryAction !== "plan" && !planContext.planSlug ? (
              <GeneratePlanButton itemId={item.id} label="Plan this" />
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {brief.primaryAction !== "pass" && item.status !== "passed" ? (
              <ItemActionButton itemId={item.id} action="pass" label="Pass" variant="ghost" />
            ) : null}
            {brief.primaryAction !== "archive" && item.status !== "archived" ? (
              <ItemActionButton itemId={item.id} action="archive" label="Archive" variant="danger" />
            ) : null}
          </div>
        </div>
      ) : (
        <ItemActionButton itemId={item.id} action="restore" label="Restore" variant="secondary" />
      )}
    </section>
  );
}

function PrimaryAction({
  itemId,
  action,
}: {
  itemId: string;
  action: ConsiderationPrimaryAction;
}) {
  switch (action) {
    case "plan":
      return <GeneratePlanButton itemId={itemId} label="Plan this" />;
    case "hold":
      return (
        <ItemActionButton
          itemId={itemId}
          action="move-holding"
          label="Keep in Holding"
          variant="primary"
        />
      );
    case "upcoming":
      return (
        <ItemActionButton
          itemId={itemId}
          action="add-upcoming"
          label="Add to Upcoming"
          variant="primary"
        />
      );
    case "pass":
      return <ItemActionButton itemId={itemId} action="pass" label="Pass" variant="primary" />;
    case "archive":
      return <ItemActionButton itemId={itemId} action="archive" label="Archive" variant="danger" />;
    case "save":
      return <ItemActionButton itemId={itemId} action="save" label="Save" variant="primary" />;
  }
}

function DebugMetadata({ debug }: { debug: ConsiderationBriefView["debug"] }) {
  return (
    <details className="mt-5 rounded-2xl border border-white/[0.06] bg-white/[0.012] px-4 py-4 text-[11px] text-warm-ivory/42">
      <summary className="flex cursor-pointer list-none items-center justify-between uppercase tracking-[0.24em] text-warm-ivory/48">
        Debug metadata
        <ChevronDown size={14} />
      </summary>
      <div className="mt-4 space-y-2">
        <div>id · {debug.itemId}</div>
        {debug.rawStatus ? <div>status · {debug.rawStatus}</div> : null}
        {debug.rawDestination ? <div>destination · {debug.rawDestination}</div> : null}
        {debug.lane ? <div>lane · {debug.lane}</div> : null}
        {debug.query ? <div>query · {debug.query}</div> : null}
        {debug.score != null ? <div>score · {Math.round(debug.score * 100)} / 100</div> : null}
        {debug.updatedAt ? <div>updated · {new Date(debug.updatedAt).toLocaleString()}</div> : null}
        {debug.createdAt ? <div>created · {new Date(debug.createdAt).toLocaleString()}</div> : null}
      </div>
    </details>
  );
}

function iconFor(name?: string, size = 16) {
  const props = { size, strokeWidth: 1.35 };
  switch (name) {
    case "category":
      return <Package {...props} />;
    case "calendar":
    case "timing":
    case "timing_fit":
      return <Calendar {...props} />;
    case "pin":
      return <MapPin {...props} />;
    case "effort":
      return <Car {...props} />;
    case "spend":
      return <Wallet {...props} />;
    case "confidence":
      return <Target {...props} />;
    case "source":
      return <Flag {...props} />;
    case "taste":
    case "taste_fit":
      return <Star {...props} />;
    case "trajectory":
    case "trajectory_fit":
      return <TrendingUp {...props} />;
    case "novelty":
    case "novelty_gap":
      return <Sparkles {...props} />;
    case "clock":
      return <Clock {...props} />;
    default:
      return <Compass {...props} />;
  }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
