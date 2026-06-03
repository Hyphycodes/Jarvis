"use client";

import { useState, useTransition, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AppFrame } from "@/components";
import { Chevron } from "@/components/icons";
import { signOut } from "@/lib/actions/auth";
import { updateProfile } from "@/lib/actions/profile";
import type { NorthPayload } from "@/lib/ai/types";

const ease = [0.25, 0.1, 0.25, 1] as const;
const APP_VERSION = "0.1.0";

// NOTE: North surface renders hardcoded reference data. Wiring to
// north_pillars/north_signals is deferred — see docs/PHASE_NORTH_WIRING.md
const PILLARS: Array<{ name: string; status: string; gradient: string }> = [
  { name: "Body", status: "Active", gradient: "linear-gradient(165deg, #2a2018 0%, #100c08 72%)" },
  { name: "Skill", status: "Needs a rep", gradient: "linear-gradient(165deg, #1d1d20 0%, #0b0b0c 72%)" },
  { name: "Creative", status: "Warm", gradient: "linear-gradient(165deg, #241813 0%, #0d0908 72%)" },
  { name: "Ownership", status: "Warm", gradient: "linear-gradient(165deg, #20231c 0%, #0a0c08 72%)" },
  { name: "Taste", status: "Warm", gradient: "linear-gradient(165deg, #261d22 0%, #0c0a0b 72%)" },
  { name: "Relationships", status: "Nurturing", gradient: "linear-gradient(165deg, #1b2126 0%, #080b0d 72%)" },
  { name: "Peace", status: "Protected", gradient: "linear-gradient(165deg, #1a2420 0%, #080c0a 72%)" },
];

const NEXT_REPS: Array<{ title: string; category: string }> = [
  { title: "Play basketball outside", category: "Body" },
  { title: "Review one land listing", category: "Ownership" },
  { title: "DJ crate cleanup", category: "Creative" },
];

const REMINDER = "Discipline today. Freedom tomorrow.";

type Props = {
  payload?: NorthPayload;
  email: string | null;
  displayName: string | null;
  homeCity: string | null;
  canEdit: boolean;
};

// payload preserved so the loader signature is unchanged; the surface renders
// hardcoded reference content.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function NorthSigned({ payload, email, displayName, homeCity, canEdit }: Props) {
  void payload;
  return (
    <AppFrame>
      <Header />
      <Hero />
      <NorthStar />
      <Pillars />
      <NextRightSteps />
      <NorthReminder />
      <AccountSettings
        email={email}
        displayName={displayName}
        homeCity={homeCity}
        canEdit={canEdit}
      />
    </AppFrame>
  );
}

// ── Header (matches Radar header treatment) ─────────────────────────────────

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
    .toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
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
      {/* left-edge fade so the image bleeds cleanly into the page */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, #0a0a08 0%, rgba(10,10,8,0.55) 28%, transparent 62%)",
        }}
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

// ── Pillars ──────────────────────────────────────────────────────────────────

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

function PillarCard({
  index,
  name,
  status,
  gradient,
}: {
  index: number;
  name: string;
  status: string;
  gradient: string;
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
      <div
        className="mt-3 h-[152px] w-full rounded-[3px]"
        style={{ background: gradient }}
      />
      <div className="mt-3 px-1 text-[10px] uppercase tracking-[0.18em] text-warm-ivory/45">
        {status}
      </div>
    </div>
  );
}

// ── Next Right Steps ──────────────────────────────────────────────────────────

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
            <span
              aria-hidden
              className="h-[18px] w-[18px] shrink-0 rounded-full border border-warm-ivory/30"
            />
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
    <section
      className="mt-10 pl-4"
      style={{ borderLeft: "2px solid rgba(184,137,55,0.4)" }}
    >
      <div className="text-[10px] uppercase tracking-[0.18em] text-warm-ivory/45">
        North Reminder
      </div>
      <p className="mt-2 font-serif text-[18px] italic leading-[1.4] text-warm-ivory">
        {REMINDER}
      </p>
    </section>
  );
}

// ── Account / Settings (inline) ───────────────────────────────────────────────

function AccountSettings({
  email,
  displayName,
  homeCity,
  canEdit,
}: {
  email: string | null;
  displayName: string | null;
  homeCity: string | null;
  canEdit: boolean;
}) {
  const [voiceOn, setVoiceOn] = useState(true);
  const [radarAlerts, setRadarAlerts] = useState(true);
  const [confirm, setConfirm] = useState<null | "signout" | "clear">(null);

  return (
    <div className="mt-12 border-t border-divider/60 pt-2">
      <Section label="Identity">
        <IdentityCard initialName={displayName} email={email} canEdit={canEdit} />
      </Section>

      <Section label="Voice">
        <div className="lux-surface-quiet rounded-[var(--radius-card)] px-4">
          <Row label="Voice" control={<Toggle on={voiceOn} onChange={setVoiceOn} />} />
          <Row label="Voice selection" value="Daniel" chevron />
          <Row label="Voice speed" value="Normal" chevron last />
        </div>
      </Section>

      <Section label="Notifications">
        <div className="lux-surface-quiet rounded-[var(--radius-card)] px-4">
          <Row label="Morning briefing" value="7:30 AM" chevron />
          <Row
            label="Radar alerts"
            control={<Toggle on={radarAlerts} onChange={setRadarAlerts} />}
            last
          />
        </div>
      </Section>

      <Section label="Discovery">
        <div className="lux-surface-quiet rounded-[var(--radius-card)] px-4">
          <Row label="Location" value={homeCity ?? "Set location"} chevron />
          <Row label="Taste categories" value="6 active" chevron last />
        </div>
      </Section>

      <Section label="Privacy">
        <div className="lux-surface-quiet rounded-[var(--radius-card)] px-4">
          <Row label="Clear memory" chevron onClick={() => setConfirm("clear")} />
          <Row label="Export data" chevron last />
        </div>
      </Section>

      <Section label="Account">
        <div className="lux-surface-quiet rounded-[var(--radius-card)] px-4">
          <Row label="Email" value={email ?? "—"} />
          <Row
            label="Sign out"
            chevron
            danger
            onClick={() => setConfirm("signout")}
            last
          />
        </div>
      </Section>

      <Section label="App">
        <div className="lux-surface-quiet rounded-[var(--radius-card)] px-4">
          <Row label="Version" value={APP_VERSION} />
          <Row label="Feedback" chevron last />
        </div>
      </Section>

      <AnimatePresence>
        {confirm === "signout" ? (
          <ConfirmDialog
            key="signout"
            message="Sign out of JARVIS on this device?"
            confirmLabel="Sign out"
            onCancel={() => setConfirm(null)}
            onConfirm={async () => {
              await signOut();
            }}
          />
        ) : null}
        {confirm === "clear" ? (
          <ConfirmDialog
            key="clear"
            message="This will reset JARVIS's context. Are you sure?"
            confirmLabel="Clear memory"
            onCancel={() => setConfirm(null)}
            onConfirm={async () => {
              // Placeholder — memory wipe is not wired yet.
              setConfirm(null);
            }}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function IdentityCard({
  initialName,
  email,
  canEdit,
}: {
  initialName: string | null;
  email: string | null;
  canEdit: boolean;
}) {
  const [name, setName] = useState(initialName ?? "");
  const [saved, setSaved] = useState(initialName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    const next = name.trim();
    if (next === saved.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        await updateProfile({ display_name: next || null });
        setSaved(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save.");
      }
    });
  }

  return (
    <div className="lux-surface-quiet flex items-center gap-4 rounded-[var(--radius-card)] px-4 py-4">
      <span
        aria-hidden
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full font-serif text-[18px] italic text-warm-ivory"
        style={{
          border: "1px solid rgba(201,169,110,0.5)",
          background: "rgba(201,169,110,0.05)",
        }}
      >
        {initials(name, email)}
      </span>
      <div className="min-w-0 flex-1">
        <label className="block text-[10px] uppercase tracking-editorial text-warm-ivory/45">
          Display name
        </label>
        <input
          type="text"
          value={name}
          disabled={!canEdit || pending}
          onChange={(e) => setName(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          placeholder="How JARVIS addresses you"
          className="mt-1 w-full bg-transparent text-[16px] font-light text-warm-ivory outline-none placeholder:text-warm-ivory/30 disabled:opacity-60"
        />
        {error ? (
          <p className="mt-1 text-[11px] text-status-amber">{error}</p>
        ) : pending ? (
          <p className="mt-1 text-[11px] text-warm-ivory/40">Saving…</p>
        ) : null}
      </div>
    </div>
  );
}

function initials(name: string, email: string | null): string {
  const source = name.trim() || (email ? email.split("@")[0] : "");
  if (!source) return "J";
  const parts = source.split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((p) => p[0]);
  return (letters.join("") || source[0]).toUpperCase();
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="motion-card mt-10">
      <div className="lux-label">{label}</div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Row({
  label,
  value,
  control,
  chevron,
  danger,
  last,
  onClick,
}: {
  label: string;
  value?: ReactNode;
  control?: ReactNode;
  chevron?: boolean;
  danger?: boolean;
  last?: boolean;
  onClick?: () => void;
}) {
  const interactive = !!onClick;
  const Tag = interactive ? "button" : "div";
  return (
    <Tag
      {...(interactive ? { type: "button" as const, onClick } : {})}
      className={
        "flex min-h-[52px] w-full items-center justify-between gap-4 py-3 text-left " +
        (last ? "" : "border-b border-divider/35 ") +
        (interactive
          ? "transition-opacity duration-300 ease-atmospheric hover:opacity-80 active:translate-y-px"
          : "")
      }
    >
      <span
        className={
          "text-[15px] font-light " +
          (danger ? "text-warm-ivory/85" : "text-warm-ivory/90")
        }
      >
        {label}
      </span>
      <span className="flex items-center gap-2.5">
        {value ? (
          <span className="text-[14px] font-light text-warm-ivory/55">{value}</span>
        ) : null}
        {control ?? null}
        {chevron ? (
          <Chevron direction="right" size={14} className="text-warm-ivory/40" />
        ) : null}
      </span>
    </Tag>
  );
}

function Toggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="relative inline-flex h-[26px] w-[44px] shrink-0 items-center rounded-full transition-colors duration-300 ease-atmospheric"
      style={{
        background: on ? "rgba(201,169,110,0.55)" : "rgba(246,239,221,0.1)",
        border: on
          ? "1px solid rgba(201,169,110,0.6)"
          : "1px solid rgba(246,239,221,0.12)",
      }}
    >
      <motion.span
        aria-hidden
        className="absolute h-[18px] w-[18px] rounded-full"
        style={{ background: on ? "#f3eddf" : "rgba(246,239,221,0.6)" }}
        animate={{ left: on ? 22 : 3 }}
        transition={{ duration: 0.3, ease }}
      />
    </button>
  );
}

function ConfirmDialog({
  message,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  message: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center px-5 pb-8 sm:items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease }}
    >
      <motion.button
        type="button"
        aria-label="Cancel"
        onClick={onCancel}
        className="absolute inset-0 bg-black/60"
        style={{ backdropFilter: "blur(2px)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3, ease }}
      />
      <motion.div
        role="alertdialog"
        aria-modal="true"
        className="lux-surface relative w-full max-w-[400px] rounded-[var(--radius-card)] p-6"
        initial={{ opacity: 0, y: 16, filter: "blur(3px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={{ opacity: 0, y: 16, filter: "blur(3px)" }}
        transition={{ duration: 0.32, ease }}
      >
        <p className="font-serif text-[19px] italic leading-[1.35] text-warm-ivory">
          {message}
        </p>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="min-h-10 px-4 text-[11px] uppercase tracking-editorial text-warm-ivory/55 transition-opacity duration-300 ease-atmospheric hover:opacity-80 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(async () => { await onConfirm(); })}
            className="min-h-10 border border-muted-gold/45 px-5 text-[11px] uppercase tracking-editorial text-muted-gold transition duration-300 ease-atmospheric hover:border-muted-gold hover:text-soft-gold active:translate-y-px disabled:opacity-40"
          >
            {pending ? "…" : confirmLabel}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
