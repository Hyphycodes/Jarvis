"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, type SVGProps } from "react";
import { AppFrame } from "@/components";
import { Chevron } from "@/components/icons";
import type { NorthPayload } from "@/lib/ai/types";

const PILLARS: Array<{ name: string; status: string; gradient: string }> = [
  { name: "Body",          status: "Active",      gradient: "linear-gradient(165deg, #2a2018 0%, #100c08 72%)" },
  { name: "Skill",         status: "Needs a rep", gradient: "linear-gradient(165deg, #1d1d20 0%, #0b0b0c 72%)" },
  { name: "Creative",      status: "Warm",        gradient: "linear-gradient(165deg, #241813 0%, #0d0908 72%)" },
  { name: "Ownership",     status: "Warm",        gradient: "linear-gradient(165deg, #20231c 0%, #0a0c08 72%)" },
  { name: "Taste",         status: "Warm",        gradient: "linear-gradient(165deg, #261d22 0%, #0c0a0b 72%)" },
  { name: "Relationships", status: "Nurturing",   gradient: "linear-gradient(165deg, #1b2126 0%, #080b0d 72%)" },
  { name: "Peace",         status: "Protected",   gradient: "linear-gradient(165deg, #1a2420 0%, #080c0a 72%)" },
];

const NEXT_REPS: Array<{ title: string; category: string }> = [
  { title: "Play basketball outside", category: "Body" },
  { title: "Review one land listing", category: "Ownership" },
  { title: "DJ crate cleanup",        category: "Creative" },
];

const REMINDER = "Discipline today. Freedom tomorrow.";

// payload preserved so the loader signature is unchanged.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function NorthSigned({ payload }: { payload?: NorthPayload }) {
  void payload;
  return (
    <AppFrame>
      <Header />
      <Hero />
      <NorthStar />
      <Pillars />
      <NextRightSteps />
      <NorthReminder />
      <AccountRow />
    </AppFrame>
  );
}

// ── Header (Radar token treatment) ─────────────────────────────────────────

function Header() {
  return (
    <header className="flex flex-col gap-3 pt-6">
      <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-4">
        <h1 className="font-serif text-[52px] italic leading-[1.02] tracking-[-0.005em] text-warm-ivory">
          North
        </h1>
        <span className="self-start pt-[8px] text-[11px] uppercase tracking-[0.16em] text-warm-ivory/55">
          {formatNorthDate()}
        </span>
      </div>
      <p className="max-w-[42ch] text-[15px] leading-[1.55] text-warm-ivory/62">
        The life you&apos;re building.
        <br />
        This is the destination. This is the path.
      </p>
      <div className="h-px w-8 bg-muted-gold/30" />
    </header>
  );
}

function formatNorthDate(): string {
  return new Date()
    .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    .toUpperCase();
}

// ── Hero ────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <div
      aria-hidden
      className="relative -mr-6 mt-6 h-[300px] overflow-hidden rounded-l-[3px]"
      style={{
        background:
          "url('/images/north-hero.jpg') center right / cover no-repeat, " +
          "radial-gradient(ellipse at 64% 46%, rgba(190,128,54,0.42) 0%, rgba(26,18,11,0.9) 46%, #0a0a08 100%)",
      }}
    >
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(90deg, #0a0a08 0%, rgba(10,10,8,0.55) 28%, transparent 62%)" }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-24"
        style={{ background: "linear-gradient(180deg, transparent, #0a0a08)" }}
      />
    </div>
  );
}

// ── North Star ──────────────────────────────────────────────────────────────

function NorthStar() {
  return (
    <section className="mt-8">
      <div className="text-[11px] uppercase tracking-[0.22em] text-warm-ivory/45">
        The North Star
      </div>
      <h2 className="mt-4 font-serif text-[40px] leading-[1.04] tracking-[-0.01em] text-warm-ivory">
        A slower life. Owned.
      </h2>
      <div className="mt-4 h-px w-8 bg-muted-gold/30" />
      <p className="mt-5 max-w-[34ch] text-[15px] leading-[1.55] text-warm-ivory/62">
        Surrounded by beauty,
        <br />
        craft, and real connection.
      </p>
      <button
        type="button"
        className="mt-6 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-warm-ivory/75 transition-opacity duration-300 ease-atmospheric hover:text-warm-ivory"
      >
        View Vision <span aria-hidden>→</span>
      </button>
    </section>
  );
}

// ── Pillars ─────────────────────────────────────────────────────────────────

function Pillars() {
  return (
    <section className="mt-12">
      <div className="text-[11px] uppercase tracking-[0.22em] text-warm-ivory/70">
        Pillars
      </div>
      <div
        data-no-embla-drag
        className="-mx-6 mt-5 overflow-x-auto px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ touchAction: "pan-x" }}
      >
        <div className="flex gap-3">
          {PILLARS.map((p, i) => (
            <PillarCard key={p.name} index={i} {...p} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PillarCard({ index, name, status, gradient }: {
  index: number; name: string; status: string; gradient: string;
}) {
  return (
    <div className="w-[150px] shrink-0">
      <div className="px-1">
        <div className="text-[11px] tracking-[0.12em] text-warm-ivory/45">
          {String(index + 1).padStart(2, "0")}
        </div>
        <div className="mt-1.5 font-serif text-[20px] leading-tight text-warm-ivory">
          {name}
        </div>
        <div className="mt-2 h-px w-6 bg-warm-ivory/25" />
      </div>
      <div className="mt-3 h-[152px] w-full rounded-[3px]" style={{ background: gradient }} />
      <div className="mt-3 px-1 text-[10px] uppercase tracking-[0.18em] text-warm-ivory/45">
        {status}
      </div>
    </div>
  );
}

// ── Next Right Steps ─────────────────────────────────────────────────────────

function NextRightSteps() {
  return (
    <section className="mt-12">
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-[0.22em] text-warm-ivory/70">
          Next Right Steps
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-warm-ivory/55 transition-opacity duration-300 ease-atmospheric hover:text-warm-ivory/80"
        >
          View All <span aria-hidden>→</span>
        </button>
      </div>
      <ul className="mt-5 flex flex-col">
        {NEXT_REPS.map((rep, i) => (
          <li
            key={rep.title}
            className={
              "flex items-center gap-4 py-4 " +
              (i !== NEXT_REPS.length - 1 ? "border-b border-divider/45" : "")
            }
          >
            <span aria-hidden className="h-[18px] w-[18px] shrink-0 rounded-full border border-warm-ivory/30" />
            <span className="min-w-0 flex-1 text-[15px] leading-snug text-warm-ivory/90">
              {rep.title}
            </span>
            <span className="shrink-0 text-[10px] uppercase tracking-[0.18em] text-warm-ivory/45">
              {rep.category}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── North Reminder ────────────────────────────────────────────────────────────

function NorthReminder() {
  return (
    <section className="mt-10 pl-4" style={{ borderLeft: "2px solid rgba(184,137,55,0.4)" }}>
      <div className="text-[10px] uppercase tracking-[0.18em] text-warm-ivory/45">
        North Reminder
      </div>
      <p className="mt-2 font-serif text-[18px] italic leading-[1.4] text-warm-ivory">
        {REMINDER}
      </p>
    </section>
  );
}

// ── Account row ───────────────────────────────────────────────────────────────

function AccountRow() {
  return (
    <section className="mt-10 border-t border-divider/45">
      <Link
        href="/settings"
        className="flex min-h-[52px] items-center justify-between py-4 transition-opacity duration-300 ease-atmospheric hover:opacity-80 active:translate-y-px"
      >
        <span className="text-[11px] uppercase tracking-[0.22em] text-warm-ivory/70">
          Account
        </span>
        <Chevron direction="right" size={14} className="text-warm-ivory/40" />
      </Link>
    </section>
  );
}
