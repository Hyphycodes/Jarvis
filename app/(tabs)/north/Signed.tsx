"use client";

import Link from "next/link";
import { useState, type ReactNode, type SVGProps } from "react";
import { AppFrame } from "@/components";
import type { NorthPayload } from "@/lib/ai/types";

// NOTE: North surface currently renders hardcoded reference data.
// Wiring to north_pillars/north_signals is deferred — see docs/PHASE_NORTH_WIRING.md
const LIFE_CATEGORIES: Array<{
  id: string;
  name: string;
  status: string;
  tone: "green" | "amber";
  description: string;
  currentRead: string;
  recommendedRep: {
    title: string;
    sub: string;
    meta: string;
    icon: (props: SVGProps<SVGSVGElement>) => ReactNode;
  };
  icon: (props: SVGProps<SVGSVGElement>) => ReactNode;
}> = [
  {
    id: "body",
    name: "Body",
    status: "Active",
    tone: "green",
    description: "Strength, sunlight, mobility. Earn your nights.",
    currentRead: "Strong body, clear head. Keep it physical and simple.",
    recommendedRep: {
      title: "Play basketball outside",
      sub: "Get a recovery block in.",
      meta: "45-60 min · Free · After work",
      icon: BasketballIcon,
    },
    icon: BodyIcon,
  },
  {
    id: "skill",
    name: "Skill",
    status: "Needs a rep",
    tone: "amber",
    description: "Tools you can actually use. Build something this week.",
    currentRead: "Good tools get dull if they sit. Choose one useful rep.",
    recommendedRep: {
      title: "Gun range session",
      sub: "Controlled practice, not noise.",
      meta: "60 min · Paid · Weekend",
      icon: SkillIcon,
    },
    icon: SkillIcon,
  },
  {
    id: "creative",
    name: "Creative",
    status: "Warm",
    tone: "amber",
    description: "Music, frames, crates. Keep the lane open.",
    currentRead: "The creative system is warm. Keep the references moving.",
    recommendedRep: {
      title: "DJ crate cleanup",
      sub: "One clean pass through the lane.",
      meta: "45 min · Free · Evening",
      icon: RecordIcon,
    },
    icon: CreativeIcon,
  },
  {
    id: "ownership",
    name: "Ownership",
    status: "Warm",
    tone: "amber",
    description: "Land, deals, leverage. Slow compounding moves.",
    currentRead: "Ownership is a slow pressure. Keep the signal close.",
    recommendedRep: {
      title: "Review one land listing",
      sub: "Run a quick deal screen.",
      meta: "30 min · Free · Weekend morning",
      icon: MapPinSmallIcon,
    },
    icon: OwnershipIcon,
  },
  {
    id: "taste",
    name: "Taste",
    status: "Warm",
    tone: "amber",
    description: "Watches, menswear, dining. Refine the standard.",
    currentRead: "Taste is a filter. Sharpen it without chasing noise.",
    recommendedRep: {
      title: "Menswear reference pass",
      sub: "Save one useful silhouette.",
      meta: "20 min · Free · Quiet block",
      icon: TasteIcon,
    },
    icon: TasteIcon,
  },
  {
    id: "relationships",
    name: "Relationships",
    status: "Warm",
    tone: "amber",
    description: "Small circle, deep contact. Reach for one this week.",
    currentRead: "Small circle, real contact. Keep one line warm.",
    recommendedRep: {
      title: "Text one person",
      sub: "Reach for someone worth keeping close.",
      meta: "10 min · Free · Today",
      icon: RelationshipsIcon,
    },
    icon: RelationshipsIcon,
  },
  {
    id: "peace",
    name: "Peace",
    status: "Protected",
    tone: "green",
    description: "Quiet. Faith. Solitude. The non-negotiable hour.",
    currentRead: "Not every quiet space needs to be filled.",
    recommendedRep: {
      title: "Quiet recovery night",
      sub: "Protect the room and keep the board clean.",
      meta: "Evening · Free · Home",
      icon: PeaceIcon,
    },
    icon: PeaceIcon,
  },
];

// TODO(supabase): wire to north_signals or a future "next reps" table.
const NEXT_REPS: Array<{
  title: string;
  sub: string;
  category: string;
  icon: (props: SVGProps<SVGSVGElement>) => ReactNode;
}> = [
  {
    title: "Play basketball outside",
    sub: "Get a recovery block in.",
    category: "Body",
    icon: BasketballIcon,
  },
  {
    title: "Review one land listing",
    sub: "Run a quick deal screen.",
    category: "Ownership",
    icon: MapPinSmallIcon,
  },
  {
    title: "DJ crate cleanup",
    sub: "One camera framing practice.",
    category: "Creative",
    icon: RecordIcon,
  },
];

// payload is preserved so the loader signature is unchanged; the redesign
// renders hardcoded content per the Sprint 4 spec.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function NorthSigned({ payload }: { payload?: NorthPayload }) {
  void payload;
  return (
    <AppFrame>
      <Header />
      <NorthStarCard />
      <BuildSection />
      <NextRepsSection />
      <NorthReminderCard />
    </AppFrame>
  );
}

// ── Header ────────────────────────────────────────────────────────────────

function Header() {
  return (
    <header className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-4">
        <h1 className="font-serif text-[52px] italic leading-[1.02] tracking-[-0.005em] text-warm-ivory">
          North
        </h1>
        <div className="flex items-center gap-3 pt-[8px]">
          <span className="text-[11px] uppercase tracking-[0.16em] text-warm-ivory/55">
            {formatNorthDate()}
          </span>
          <Link
            href="/settings"
            aria-label="Settings"
            className="inline-flex items-center justify-center transition-opacity duration-300 ease-atmospheric hover:opacity-80"
          >
            <GearIcon />
          </Link>
        </div>
      </div>
      <p className="text-[14px] font-light" style={{ color: "#6b6458" }}>
        Long-term direction.
      </p>
    </header>
  );
}

function GearIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#9a9080"
      strokeWidth={1}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function formatNorthDate(): string {
  return new Date()
    .toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
    .toUpperCase();
}

// ── North Star Card ──────────────────────────────────────────────────────

function NorthStarCard() {
  return (
    <section
      className="relative mt-6 overflow-hidden"
      style={{
        border: "1px solid rgba(201,169,110,0.15)",
        borderRadius: "16px",
        background:
          "radial-gradient(ellipse at 20% 30%, rgba(201,169,110,0.06) 0%, #1a1a14 60%)",
        minHeight: "260px",
      }}
    >
      {/* Mountain placeholder — swap /public/north-mountain.svg later. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/north-mountain.svg"
        alt=""
        aria-hidden
        className="pointer-events-none absolute bottom-0 right-0"
        style={{
          width: "50%",
          maxWidth: "260px",
          opacity: 0.07,
        }}
      />
      <div className="relative z-10 flex flex-col gap-3 p-6">
        <div className="flex items-center gap-2">
          <GoldStar />
          <span
            className="font-sans uppercase"
            style={{
              color: "var(--gold)",
              fontSize: "10px",
              letterSpacing: "0.15em",
            }}
          >
            The North Star
          </span>
        </div>
        <h2
          className="font-serif"
          style={{
            color: "var(--text-primary)",
            fontSize: "26px",
            lineHeight: 1.15,
            letterSpacing: "-0.01em",
          }}
        >
          A slower life. Owned.
        </h2>
        <p
          className="max-w-[34ch] text-[13px] leading-[1.55]"
          style={{ color: "var(--text-muted)" }}
        >
          Built through discipline, taste, useful skill, and real connection.
        </p>
        <button
          type="button"
          className="mt-2 inline-flex items-center gap-1.5 self-start font-sans uppercase transition-opacity duration-300 ease-atmospheric hover:opacity-80"
          style={{
            color: "var(--gold)",
            fontSize: "11px",
            letterSpacing: "0.12em",
          }}
        >
          View The Standard <ArrowRightTiny />
        </button>
      </div>
    </section>
  );
}

function GoldStar() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 2 L13.5 10.5 L22 12 L13.5 13.5 L12 22 L10.5 13.5 L2 12 L10.5 10.5 Z"
        fill="var(--gold)"
      />
    </svg>
  );
}

function ArrowRightTiny() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 12 H19 M13 6 L19 12 L13 18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── The Build Section ─────────────────────────────────────────────────────

function BuildSection() {
  const [openId, setOpenId] = useState<string | null>("body");

  return (
    <section className="mt-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3
            className="font-sans uppercase"
            style={{
              color: "var(--text-primary)",
              fontSize: "11px",
              letterSpacing: "0.15em",
            }}
          >
            The Build
          </h3>
          <p
            className="mt-1 text-[13px]"
            style={{ color: "var(--text-muted)" }}
          >
            Your life, in motion.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 font-sans uppercase transition-opacity duration-300 ease-atmospheric hover:opacity-80"
          style={{
            color: "var(--gold)",
            fontSize: "11px",
            letterSpacing: "0.12em",
          }}
        >
          View All <ArrowRightTiny />
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-[10px]">
        {LIFE_CATEGORIES.map((cat) => (
          <CategoryAccordion
            key={cat.id}
            category={cat}
            open={openId === cat.id}
            onToggle={() => setOpenId(openId === cat.id ? null : cat.id)}
          />
        ))}
      </div>
    </section>
  );
}

function CategoryAccordion({
  category,
  open,
  onToggle,
}: {
  category: (typeof LIFE_CATEGORIES)[number];
  open: boolean;
  onToggle: () => void;
}) {
  const Icon = category.icon;
  const RepIcon = category.recommendedRep.icon;
  const dotColor =
    category.tone === "green" ? "var(--status-green)" : "var(--status-amber)";

  return (
    <div
      className={open ? "lux-surface" : "lux-surface-quiet"}
      style={{
        borderColor: open ? "var(--border-strong)" : "var(--border)",
        borderRadius: "var(--radius-card)",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-4 px-4 py-[14px] text-left"
      >
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
          style={{
            border: "1px solid rgba(201,169,110,0.5)",
            background: "rgba(201,169,110,0.05)",
          }}
        >
          <Icon width={18} height={18} stroke="var(--gold)" strokeWidth={1} fill="none" />
        </span>
        <span
          className="flex-1 font-serif"
          style={{
            color: "var(--text-primary)",
            fontSize: "19px",
            lineHeight: 1.1,
          }}
        >
          {category.name}
        </span>
        <span className="flex items-center gap-2 shrink-0">
          <span
            className="font-sans uppercase"
            style={{
              color: category.tone === "green" ? "var(--status-green)" : "var(--status-amber)",
              fontSize: "10px",
              letterSpacing: "0.18em",
              fontWeight: 400,
            }}
          >
            {category.status}
          </span>
          <span
            aria-hidden
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: dotColor }}
          />
          <span
            aria-hidden
            className="ml-1 transition-transform duration-300 ease-atmospheric"
            style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
          >
            <ChevronDownIcon />
          </span>
        </span>
      </button>

      <div
        className="overflow-hidden transition-[max-height,opacity] duration-300 ease-atmospheric"
        style={{
          maxHeight: open ? "430px" : "0px",
          opacity: open ? 1 : 0,
        }}
      >
        <div
          className="px-6 pb-6 pt-2"
        >
          <div className="lux-divider h-px w-full" />
          <div className="mt-5 grid grid-cols-[1fr_auto] gap-4">
            <div>
              <div className="lux-label">Current Read</div>
              <p
                className="mt-3 max-w-[21ch] font-serif text-[23px] leading-[1.15]"
                style={{ color: "var(--text-primary)" }}
              >
                {category.currentRead}
              </p>
            </div>
            <div
              aria-hidden
              className="hidden h-[92px] w-[96px] items-center justify-center opacity-75 sm:flex"
              style={{ color: "var(--gold)" }}
            >
              <Icon width={86} height={86} stroke="currentColor" strokeWidth={1.1} fill="none" />
            </div>
          </div>
          <div className="mt-5 h-px w-full bg-white/[0.07]" />
          <div className="mt-5">
            <div className="lux-label">Recommended Rep</div>
            <div className="mt-4 grid grid-cols-[52px_1fr] gap-4">
              <span
                className="flex h-12 w-12 items-center justify-center rounded-full"
                style={{
                  border: "1px solid var(--gold-dim)",
                  background: "rgba(184,137,55,0.04)",
                }}
              >
                <RepIcon
                  width={26}
                  height={26}
                  stroke="var(--gold)"
                  strokeWidth={1.4}
                  fill="none"
                />
              </span>
              <div>
                <div
                  className="text-[16px] leading-tight"
                  style={{ color: "var(--text-primary)" }}
                >
                  {category.recommendedRep.title}
                </div>
                <div className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
                  {category.recommendedRep.sub}
                </div>
                <div className="mt-2 text-[12px]" style={{ color: "var(--text-faint)" }}>
                  {category.recommendedRep.meta}
                </div>
              </div>
            </div>
          </div>
          <button
            type="button"
            className="lux-action mt-5 flex min-h-12 w-full items-center justify-between px-5 font-sans uppercase"
            style={{
              fontSize: "11px",
              letterSpacing: "0.16em",
            }}
          >
            <span>Open Rep Plan</span>
            <ArrowRightTiny />
          </button>
          <button
            type="button"
            className="lux-action mt-3 flex min-h-12 w-full items-center justify-between px-5 font-sans uppercase"
            style={{
              fontSize: "11px",
              letterSpacing: "0.16em",
            }}
          >
            <span>Create Signal</span>
            <ArrowRightTiny />
          </button>
        </div>
      </div>
    </div>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 9 L12 15 L18 9"
        stroke="var(--text-muted)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Next Reps Section ────────────────────────────────────────────────────

function NextRepsSection() {
  return (
    <section className="mt-10">
      <h3
        className="font-sans uppercase"
        style={{
          color: "var(--text-primary)",
          fontSize: "11px",
          letterSpacing: "0.15em",
        }}
      >
        Next Reps
      </h3>
      <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
        Three moves. Maximum impact.
      </p>

      <ul className="mt-4 flex flex-col">
        {NEXT_REPS.map((rep, idx) => {
          const Icon = rep.icon;
          return (
            <li
              key={rep.title}
              className="flex items-center gap-4 py-3"
              style={
                idx !== NEXT_REPS.length - 1
                  ? { borderBottom: "1px solid var(--border)" }
                  : undefined
              }
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                style={{
                  border: "1px solid var(--gold-dim)",
                  background: "rgba(184,146,42,0.05)",
                }}
              >
                <Icon
                  width={18}
                  height={18}
                  stroke="var(--gold)"
                  strokeWidth={1.5}
                  fill="none"
                />
              </span>
              <div className="min-w-0 flex-1">
                <div
                  className="text-[15px] font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  {rep.title}
                </div>
                <div
                  className="text-[12px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  {rep.sub}
                </div>
              </div>
              <span
                className="font-sans uppercase shrink-0"
                style={{
                  color: "var(--gold)",
                  fontSize: "10px",
                  letterSpacing: "0.12em",
                }}
              >
                {rep.category}
              </span>
              <span aria-hidden className="shrink-0 opacity-70">
                <ChevronRightTiny />
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ChevronRightTiny() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 6 L15 12 L9 18"
        stroke="var(--text-muted)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── North Reminder Card ──────────────────────────────────────────────────

function NorthReminderCard() {
  return (
    <section
      className="mt-10"
      style={{
        border: "1px solid var(--border)",
        borderRadius: "16px",
        background: [
          "radial-gradient(ellipse at 80% 60%, rgba(30,25,15,0.7) 0%, transparent 60%)",
          "linear-gradient(160deg, #1a1a14 0%, #0f0f0a 40%, #1c1a12 100%)",
        ].join(", "),
        padding: "20px 24px",
      }}
    >
      <div className="flex items-center gap-2">
        <GoldStar />
        <span
          className="font-sans uppercase"
          style={{
            color: "var(--gold)",
            fontSize: "10px",
            letterSpacing: "0.15em",
          }}
        >
          North Reminder
        </span>
      </div>
      <p
        className="mt-3 font-serif italic"
        style={{
          color: "var(--text-primary)",
          fontSize: "18px",
          lineHeight: 1.35,
        }}
      >
        Discipline today. Freedom tomorrow.
      </p>
    </section>
  );
}

// ── Icons (inline, minimal, 22×22 default, strokeWidth 1.5) ─────────────

function BodyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="13" cy="5" r="2" />
      <path d="M9 22 L11 14 L7 11 L9 7 L13 9 L17 8 L17 11 L14 14 L15 17 L18 22" />
    </svg>
  );
}

function SkillIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.2" />
    </svg>
  );
}

function CreativeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M9 18 V6 L19 4 V16" />
      <circle cx="7" cy="18" r="2.2" />
      <circle cx="17" cy="16" r="2.2" />
    </svg>
  );
}

function OwnershipIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 6 L9 4 L15 6 L21 4 V18 L15 20 L9 18 L3 20 Z" />
      <path d="M9 4 V18" />
      <path d="M15 6 V20" />
    </svg>
  );
}

function TasteIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M7 3 H17 L16 10 A4 4 0 0 1 8 10 Z" />
      <path d="M12 14 V21" />
      <path d="M8 21 H16" />
    </svg>
  );
}

function RelationshipsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="8" cy="8" r="3" />
      <circle cx="16" cy="9" r="2.5" />
      <path d="M2 20 C2 16 5 14 8 14 C11 14 14 16 14 20" />
      <path d="M14 20 C14 17 17 15.5 19.5 15.5 C21 15.5 22 16 22 17.5" />
    </svg>
  );
}

function PeaceIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 4 C9 9 9 14 12 19 C15 14 15 9 12 4 Z" />
      <path d="M4 14 C8 14 11 17 12 19 C9 19 6 18 4 14 Z" />
      <path d="M20 14 C16 14 13 17 12 19 C15 19 18 18 20 14 Z" />
    </svg>
  );
}

function BasketballIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12 H21 M12 3 V21" />
      <path d="M5 5 C9 9 9 15 5 19" />
      <path d="M19 5 C15 9 15 15 19 19" />
    </svg>
  );
}

function MapPinSmallIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 22 C16 16 19 12 19 9 A7 7 0 0 0 5 9 C5 12 8 16 12 22 Z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

function RecordIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}
