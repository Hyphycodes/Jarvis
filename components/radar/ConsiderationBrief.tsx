"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Clock,
  Globe,
  MapPin,
  Phone,
} from "lucide-react";
import { ItemActionButton } from "@/app/item/[id]/client-bits";
import { DatePickerSheet } from "@/components/plan/DatePickerSheet";
import type { BriefData } from "@/lib/items/briefFields";

export type ConsiderationBriefProps = {
  itemId: string;
  brief: BriefData;
  badgeLabel: string;
  title: string;
  description?: string;
  neighborhood?: string;
  address?: string;
  url?: string;
  phone?: string;
  dateLabel?: string;
  isEvent: boolean;
  isSaved: boolean;
  hasPlan: boolean;
  planSlug?: string;
  showActions: boolean;
};

export function ConsiderationBrief({
  itemId,
  brief,
  badgeLabel,
  title,
  description,
  neighborhood,
  address,
  url,
  phone,
  dateLabel,
  isEvent,
  isSaved,
  hasPlan,
  planSlug,
  showActions,
}: ConsiderationBriefProps) {
  const [showMore, setShowMore] = useState(false);

  const factParts = [dateLabel, neighborhood, brief.price_estimate].filter(
    Boolean,
  ) as string[];

  return (
    <main className="mx-auto min-h-[100dvh] w-full max-w-[440px] bg-[#0A0A0A] text-warm-ivory">
      {/* Hero */}
      <section className="relative h-[62vh] w-full overflow-hidden">
        {brief.hero_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={brief.hero_image_url}
            alt={title}
            className="h-full w-full object-cover object-center"
          />
        ) : (
          <div aria-hidden className="absolute inset-0 bg-[#111111]">
            <div className="absolute inset-0 opacity-60 [background-image:radial-gradient(rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:22px_22px]" />
            <div className="absolute inset-0 [background:radial-gradient(circle_at_30%_42%,rgba(212,175,83,0.16),transparent_42%)]" />
          </div>
        )}
        {/* Gradient fade to ink */}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_30%,rgba(10,10,10,0.55)_72%,#0A0A0A_100%)]" />

        {/* Overlay nav */}
        <nav className="absolute inset-x-0 top-0 flex items-center justify-between px-5 pt-[calc(env(safe-area-inset-top)+14px)]">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.22em] text-warm-ivory/70 transition-colors duration-300 ease-atmospheric hover:text-warm-ivory"
          >
            <ArrowLeft size={15} strokeWidth={1.6} /> Radar
          </Link>
          <Link
            href="/account/history"
            aria-label="History"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-warm-ivory/65 transition-colors duration-300 ease-atmospheric hover:text-warm-ivory"
          >
            <Clock size={18} strokeWidth={1.4} />
          </Link>
        </nav>

        {/* Verdict badge */}
        <div className="absolute inset-x-5 bottom-5">
          <div
            className="inline-flex max-w-full items-center gap-2.5 rounded-full border border-[#D4AF53]/30 bg-black/35 px-3.5 py-2 backdrop-blur-md"
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#D4AF53]" />
            <span className="shrink-0 text-[10px] uppercase tracking-[0.18em] text-[#D4AF53]">
              {badgeLabel}
            </span>
            <span className="text-[#D4AF53]/40">·</span>
            <span className="truncate font-serif text-[15px] italic leading-tight text-warm-ivory/90">
              {brief.jarvis_line}
            </span>
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="px-5 pb-8 pt-5">
        <h1 className="font-serif text-[30px] leading-[1.05] text-[#FAFAF7]">
          {title}
        </h1>
        {brief.who_its_for ? (
          <p className="mt-2 text-[13px] leading-[1.45] text-[#FAFAF7]/50">
            {brief.who_its_for}
          </p>
        ) : null}
        {factParts.length > 0 ? (
          <div className="mt-4 text-[10px] uppercase tracking-[0.14em] text-[#D4AF53]">
            {factParts.join("  ·  ")}
          </div>
        ) : null}

        {/* Actions */}
        {showActions ? (
          <div className="mt-7 space-y-3">
            {hasPlan && planSlug ? (
              <Link
                href={`/plan/${planSlug}`}
                className="flex min-h-[54px] w-full items-center justify-center rounded-2xl border border-[#D4AF53] px-5 text-[12px] uppercase tracking-[0.22em] text-[#D4AF53] transition-colors duration-300 ease-atmospheric hover:bg-[#D4AF53]/10"
              >
                View Plan
              </Link>
            ) : isSaved ? (
              <PlanThisButton itemId={itemId} />
            ) : isEvent ? (
              <ItemActionButton
                itemId={itemId}
                action="add-upcoming"
                label="Add to Upcoming"
                variant="primary"
              />
            ) : (
              <ItemActionButton
                itemId={itemId}
                action="save"
                label="Save This"
                variant="primary"
              />
            )}

            <ItemActionButton
              itemId={itemId}
              action="move-holding"
              label="Move to Holding"
              variant="secondary"
            />

            <div className="grid grid-cols-2 gap-3">
              <ItemActionButton
                itemId={itemId}
                action="interested-later"
                label="Later"
                variant="ghost"
              />
              <ItemActionButton
                itemId={itemId}
                action="watch"
                label="Watch"
                variant="ghost"
              />
              <ItemActionButton
                itemId={itemId}
                action="better-version"
                label="Better Version"
                variant="ghost"
              />
              <ItemActionButton
                itemId={itemId}
                action="save-taste"
                label="Save Taste"
                variant="ghost"
              />
            </div>

            <div className="h-px bg-white/[0.07]" />

            <div className="grid grid-cols-2 gap-3">
              <ItemActionButton
                itemId={itemId}
                action="pass"
                label="Pass"
                variant="ghost"
              />
              <ItemActionButton
                itemId={itemId}
                action="mute"
                label="Mute"
                variant="ghost"
              />
            </div>
          </div>
        ) : (
          <div className="mt-7">
            <ItemActionButton
              itemId={itemId}
              action="restore"
              label="Restore"
              variant="secondary"
            />
          </div>
        )}

        {/* More */}
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.22em] text-warm-ivory/45 transition-colors duration-300 ease-atmospheric hover:text-warm-ivory/75"
          >
            more
            <ChevronDown
              size={14}
              strokeWidth={1.5}
              className={`transition-transform duration-300 ${showMore ? "rotate-180" : ""}`}
            />
          </button>
        </div>

        {showMore ? (
          <div className="mt-5">
            {description ? (
              <p className="text-[14px] leading-[1.6] text-warm-ivory/65">
                {description}
              </p>
            ) : null}
            <div className="mt-4 divide-y divide-white/[0.07] border-y border-white/[0.07]">
              {address ? (
                <DetailRow
                  icon={<MapPin size={17} strokeWidth={1.4} />}
                  label={address}
                  href={`https://maps.apple.com/?q=${encodeURIComponent(address)}`}
                />
              ) : null}
              {url ? (
                <DetailRow
                  icon={<Globe size={17} strokeWidth={1.4} />}
                  label={prettyUrl(url)}
                  href={url}
                />
              ) : null}
              {phone ? (
                <DetailRow
                  icon={<Phone size={17} strokeWidth={1.4} />}
                  label={phone}
                  href={`tel:${phone.replace(/[^\d+]/g, "")}`}
                />
              ) : null}
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function DetailRow({
  icon,
  label,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  href: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="flex items-center gap-3 py-3.5 text-warm-ivory/75 transition-colors duration-300 ease-atmospheric hover:text-warm-ivory"
    >
      <span className="text-[#D4AF53]/80">{icon}</span>
      <span className="flex-1 truncate text-[14px]">{label}</span>
      <ChevronRight size={16} strokeWidth={1.4} className="text-warm-ivory/35" />
    </a>
  );
}

function prettyUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Plan This — instant create + date picker flow. Creates the plan shell
 * immediately, opens the date picker while the plan builds in the background,
 * then surfaces a "building → ready" status that links to the finished plan.
 */
function PlanThisButton({ itemId }: { itemId: string }) {
  const [planId, setPlanId] = useState<string | null>(null);
  const [planSlug, setPlanSlug] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [scheduled, setScheduled] = useState(false);
  const [building, setBuilding] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/plans/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ radar_item_id: itemId }),
      });
      const json = (await res.json()) as {
        ok?: true;
        plan_id?: string;
        plan_slug?: string;
        reused?: boolean;
        error?: string;
      };
      if (!res.ok || json.error || !json.plan_id || !json.plan_slug) {
        setError(json.error ?? `HTTP ${res.status}`);
        return;
      }
      setPlanId(json.plan_id);
      setPlanSlug(json.plan_slug);
      setBuilding(!json.reused);
      setSheetOpen(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  // Poll build status after scheduling, until the plan is ready.
  useEffect(() => {
    if (!scheduled || !planId || !building) return;
    let active = true;
    const timer = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/plans/${planId}/status`);
        const json = (await res.json()) as { build_status?: string };
        if (active && json.build_status === "ready") {
          setBuilding(false);
          window.clearInterval(timer);
        }
      } catch {
        /* keep polling */
      }
    }, 2500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [scheduled, planId, building]);

  if (scheduled && planSlug) {
    return (
      <div className="space-y-2">
        {building ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-warm-ivory/55">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#D4AF53]" />
            Plan building…
          </div>
        ) : null}
        <Link
          href={`/plan/${planSlug}`}
          className="flex min-h-[54px] w-full items-center justify-center rounded-2xl border border-[#D4AF53] px-5 text-[12px] uppercase tracking-[0.22em] text-[#D4AF53] transition-colors hover:bg-[#D4AF53]/10"
        >
          Open Plan
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-stretch">
      <button
        type="button"
        onClick={start}
        disabled={pending}
        className="flex min-h-[54px] w-full items-center justify-center rounded-2xl border border-[#D4AF53] px-5 text-[12px] uppercase tracking-[0.22em] text-[#D4AF53] transition-colors hover:bg-[#D4AF53]/10 disabled:opacity-60"
      >
        {pending ? "Preparing…" : "Plan This"}
      </button>
      {error ? (
        <span className="mt-1 text-[11px] text-[#E07A6E]">{error}</span>
      ) : null}
      {planId ? (
        <DatePickerSheet
          planId={planId}
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          onConfirmed={() => {
            setScheduled(true);
            setSheetOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
