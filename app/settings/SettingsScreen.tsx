"use client";

import {
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Chevron } from "@/components/icons";
import { signOut } from "@/lib/actions/auth";
import { updateProfile } from "@/lib/actions/profile";

const ease = [0.25, 0.1, 0.25, 1] as const;

type Props = {
  email: string | null;
  displayName: string | null;
  homeCity: string | null;
  canEdit: boolean;
  version: string;
};

export function SettingsScreen({
  email,
  displayName,
  homeCity,
  canEdit,
  version,
}: Props) {
  const [voiceOn, setVoiceOn] = useState(true);
  const [radarAlerts, setRadarAlerts] = useState(true);
  const [confirm, setConfirm] = useState<null | "signout" | "clear">(null);

  return (
    <div>
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
          <Row label="Version" value={version} />
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

// ── Identity ─────────────────────────────────────────────────────────────

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

// ── Primitives ─────────────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="motion-card mt-10 border-t border-divider/60 pt-6">
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
          <span className="text-[14px] font-light text-warm-ivory/55">
            {value}
          </span>
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

// ── Confirm dialog ─────────────────────────────────────────────────────────

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
