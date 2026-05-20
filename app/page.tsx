"use client";

import { useState } from "react";
import {
  AppFrame,
  BottomNav,
  Checkbox,
  SectionLabel,
  Timeline,
  type TimelineItem,
} from "@/components";
import { Arrow, Chevron } from "@/components/icons";

export default function Page() {
  return (
    <AppFrame>
      <header className="flex flex-col gap-4">
        <div className="relative">
          <h1 className="font-serif text-[56px] leading-[1.02] tracking-[-0.01em] text-warm-ivory">
            Good evening,
            <br />
            <span className="italic">J.</span>
          </h1>
          <span className="absolute right-0 top-[18px] text-[12px] uppercase tracking-editorial text-warm-ivory/60">
            May 17, 2025
          </span>
        </div>
        <p className="max-w-[42ch] text-[15px] leading-[1.55] text-warm-ivory/65">
          Your day is set. White Sox game, tailgate at 10am.
          <br />3 stops. 1 grab list. Weather clears at 6:40pm.
        </p>
      </header>

      <div className="mt-8 h-px w-full bg-divider/70" />

      <section className="mt-6 flex flex-col">
        <SectionLabel
          trailing={
            <span className="inline-flex items-center gap-1.5 text-warm-ivory/80">
              VIEW MAP <Arrow size={12} />
            </span>
          }
        >
          The Day
        </SectionLabel>
        <div className="mt-2">
          <Timeline items={DAY_ITEMS} />
        </div>
      </section>

      <GrabList />

      <section className="mt-8 flex flex-col">
        <SectionLabel
          trailing={
            <span className="text-[11px] tracking-editorial text-warm-ivory/65">
              2 NEW
            </span>
          }
        >
          Signals
        </SectionLabel>
        <ul className="mt-3 flex flex-col gap-2">
          <SignalRow
            text="Weather clears after 6:40pm. Consider the north route home."
            ago="12m ago"
          />
          <SignalRow
            text="You haven’t spoken to Marco in 3 weeks. Last contact: Apr 26."
            ago="2h ago"
          />
        </ul>
      </section>

      <BottomNav active="Today" />
    </AppFrame>
  );
}

const DAY_ITEMS: TimelineItem[] = [
  { id: "leave", time: "8:55 AM", title: "Leave Home", detail: null },
  { id: "tony", time: "9:20 AM", title: "Tony’s Market", detail: null },
  {
    id: "tailgate",
    time: "10:00 AM",
    title: "Tailgate at Lot B",
    defaultExpanded: true,
    detail: <TailgateDetail />,
  },
  { id: "game", time: "1:10 PM", title: "White Sox vs. Rangers", detail: null },
];

function TailgateDetail() {
  return (
    <div className="mt-1 rounded-[10px] border-l border-muted-gold/70 bg-soft-black/80 p-5">
      <div className="flex items-start justify-between gap-4">
        <address className="not-italic text-[14px] leading-[1.55] text-warm-ivory/85">
          <span className="whitespace-nowrap">333 W. 35th St.</span>
          <br />
          <span className="whitespace-nowrap">Chicago, IL 60616</span>
        </address>
        <div className="flex items-start gap-2 rounded-[6px] border border-divider px-3 py-2">
          <span className="mt-[2px] flex h-5 w-5 items-center justify-center rounded-[3px] border border-warm-ivory/40 text-[11px]">
            P
          </span>
          <div className="text-right text-[11px] leading-tight tracking-editorial uppercase text-warm-ivory/80">
            Parking
            <br />
            <span className="normal-case tracking-normal text-warm-ivory/65">
              Lot B · $40
            </span>
          </div>
        </div>
      </div>

      <DetailBlock label="What to grab">
        Ice, water, cigars, lighter fluid, burgers, buns
      </DetailBlock>
      <DetailBlock label="Notes">
        Bring the JBL. Sunscreen. Get there early—lot fills fast.
      </DetailBlock>

      <div className="mt-5">
        <div className="text-[11px] uppercase tracking-editorial text-warm-ivory/55">
          Checklist
        </div>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-3">
          <Checkbox checked label="Cigars" />
          <Checkbox checked label="Ice" />
          <Checkbox label="JBL" />
          <Checkbox label="Sunscreen" />
        </div>
      </div>
    </div>
  );
}

function DetailBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-5">
      <div className="text-[11px] uppercase tracking-editorial text-warm-ivory/55">
        {label}
      </div>
      <p className="mt-2 text-[14px] leading-[1.55] text-warm-ivory/85">
        {children}
      </p>
    </div>
  );
}

function GrabList() {
  const [open, setOpen] = useState(true);
  return (
    <section className="mt-6 rounded-[10px] bg-soft-black/80">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="flex w-full items-center justify-between px-5 py-4"
        aria-expanded={open}
      >
        <span className="flex items-center gap-3 text-[11px] uppercase tracking-editorial text-warm-ivory/65">
          Grab List
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-[3px] border border-divider px-1.5 text-[10px] text-warm-ivory/70">
            5
          </span>
        </span>
        <span className="text-warm-ivory/60">
          <Chevron direction={open ? "up" : "down"} />
        </span>
      </button>
      {open ? (
        <div className="grid grid-cols-2 gap-y-3 gap-x-6 px-5 pb-5">
          <Checkbox checked label="Ticket" />
          <Checkbox label="Cash" />
          <Checkbox checked label="Cigars" />
          <Checkbox label="Sunscreen" />
          <Checkbox label="Lighter" />
        </div>
      ) : null}
    </section>
  );
}

function SignalRow({ text, ago }: { text: string; ago: string }) {
  return (
    <li className="flex items-start justify-between gap-4 border-l-2 border-muted-gold/40 bg-soft-black/70 px-4 py-3">
      <p className="text-[14px] leading-[1.5] text-warm-ivory/85">{text}</p>
      <div className="flex shrink-0 items-center gap-2 pt-[2px] text-[12px] text-warm-ivory/55">
        {ago}
        <Chevron direction="right" size={14} />
      </div>
    </li>
  );
}
