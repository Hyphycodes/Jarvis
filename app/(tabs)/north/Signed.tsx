"use client";

import { useState, type ReactNode, type SVGProps } from "react";
import { AppFrame } from "@/components";
import type { NorthPayload } from "@/lib/ai/types";

// TODO(supabase): wire to north_pillars or a future life_categories table.
// Sprint 4 design ships these statuses hardcoded — see prompt for rationale.
const LIFE_CATEGORIES: Array<{
  id: string;
  name: string;
  status: string;
  tone: "green" | "amber";
  description: string;
  icon: (props: SVGProps<SVGSVGElement>) => ReactNode;
}> = [
  {
    id: "body",
    name: "Body",
    status: "Active",
    tone: "green",
    description: "Strength, sunlight, mobility. Earn your nights.",
    icon: BodyIcon,
  },
  {
    id: "skill",
    name: "Skill",
    status: "Needs a rep",
    tone: "amber",
    description: "Tools you can actually use. Build something this week.",
    icon: SkillIcon,
  },
  {
    id: "creative",
    name: "Creative",
    status: "Warm",
    tone: "amber",
    description: "Music, frames, crates. Keep the lane open.",
    icon: CreativeIcon,
  },
  {
    id: "ownership",
    name: "Ownership",
    status: "Warm",
    tone: "amber",
    description: "Land, deals, leverage. Slow compounding moves.",
    icon: OwnershipIcon,
  },
  {
    id: "taste",
    name: "Taste",
    status: "Warm",
    tone: "amber",
    description: "Watches, menswear, dining. Refine the standard.",
    icon: TasteIcon,
  },
  {
    id: "relationships",
    name: "Relationships",
    status: "Warm",
    tone: "amber",
    description: "Small circle, deep contact. Reach for one this week.",
    icon: RelationshipsIcon,
  },
  {
    id: "peace",
    name: "Peace",
    status: "Protected",
    tone: "green",
    description: "Quiet. Faith. Solitude. The non-negotiable hour.",
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
        <h1
          className="font-serif tracking-[-0.02em]"
          style={{
            color: "var(--text-primary)",
            fontSize: "52px",
            lineHeight: 1,
            letterSpacing: "-0.01em",
          }}
        >
          NORTH
        </h1>
        <span
          className="font-mono uppercase tracking-[0.12em] pt-2"
          style={{ color: "var(--gold)", fontSize: "11px" }}
        >
          {formatNorthDate()}
        </span>
      </div>
      <p
        className="text-[14px]"
        style={{ color: "var(--text-muted)" }}
      >
        Long-term direction.
      </p>
    </header>
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
        border: "1px solid var(--border)",
        borderRadius: "16px",
        background: [
          "radial-gradient(ellipse at 80% 60%, rgba(30,25,15,0.9) 0%, transparent 60%)",
          "linear-gradient(160deg, #1a1a14 0%, #0f0f0a 40%, #1c1a12 100%)",
        ].join(", "),
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
          opacity: 0.8,
        }}
      />
      <div className="relative z-10 flex flex-col gap-3 p-6">
        <div className="flex items-center gap-2">
          <GoldStar />
          <span
            className="font-mono uppercase"
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
          className="mt-2 inline-flex items-center gap-1.5 self-start font-mono uppercase transition-opacity duration-300 ease-atmospheric hover:opacity-80"
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
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <section className="mt-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3
            className="font-mono uppercase"
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
          className="inline-flex items-center gap-1.5 font-mono uppercase transition-opacity duration-300 ease-atmospheric hover:opacity-80"
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
  const dotColor =
    category.tone === "green" ? "var(--status-green)" : "var(--status-amber)";

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "12px",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-4 px-4 py-[14px] text-left"
      >
        <span className="shrink-0">
          <Icon width={22} height={22} stroke="var(--gold)" strokeWidth={1.5} fill="none" />
        </span>
        <span
          className="flex-1 font-serif"
          style={{
            color: "var(--text-primary)",
            fontSize: "17px",
            lineHeight: 1.1,
          }}
        >
          {category.name}
        </span>
        <span className="flex items-center gap-2 shrink-0">
          <span
            className="font-mono uppercase"
            style={{
              color: "var(--text-muted)",
              fontSize: "10px",
              letterSpacing: "0.12em",
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
          maxHeight: open ? "120px" : "0px",
          opacity: open ? 1 : 0,
        }}
      >
        <div
          className="px-4 pb-[14px]"
          style={{ paddingLeft: "calc(22px + 16px + 16px)" }}
        >
          <p
            className="text-[13px] leading-[1.5]"
            style={{ color: "var(--text-muted)" }}
          >
            {category.description}
          </p>
          <button
            type="button"
            className="mt-3 inline-flex items-center gap-1.5 font-mono uppercase transition-opacity duration-300 ease-atmospheric hover:opacity-80"
            style={{
              color: "var(--gold)",
              fontSize: "11px",
              letterSpacing: "0.12em",
            }}
          >
            Log Rep <ArrowRightTiny />
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
        className="font-mono uppercase"
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
                className="font-mono uppercase shrink-0"
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
          className="font-mono uppercase"
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
