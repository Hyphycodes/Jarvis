"use client";

import Link from "next/link";
import { useState } from "react";
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
            <ItemActionButton
              itemId={itemId}
              action="save"
              label="Go"
              variant="primary"
              redirectTo={hasPlan && planSlug ? `/plan/${planSlug}` : `/item/${itemId}`}
            />
            <ItemActionButton
              itemId={itemId}
              action="move-holding"
              label="Wait"
              variant="secondary"
            />
            <div className="pt-1">
              <ItemActionButton
                itemId={itemId}
                action="pass"
                label="Pass"
                variant="ghost"
                size="compact"
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
