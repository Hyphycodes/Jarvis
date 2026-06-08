"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";

/** Shared visual primitives for the Private Layer cards — calm, premium, summary-first. */

export function SettingsCard({
  label,
  title,
  children,
  action,
}: {
  label: string;
  title?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="mt-4 rounded-2xl border border-white/[0.07] bg-white/[0.018] px-5 py-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-gold/80">
            {label}
          </div>
          {title ? (
            <div className="mt-1 font-serif text-[22px] leading-tight text-warm-ivory">
              {title}
            </div>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function Chip({
  active,
  onClick,
  children,
  disabled,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={[
        "min-h-9 rounded-full border px-3.5 py-1.5 text-[13px] transition-colors duration-300 ease-atmospheric disabled:opacity-50",
        active
          ? "border-muted-gold/70 bg-[#B88937]/12 text-muted-gold"
          : "border-white/[0.12] bg-white/[0.02] text-warm-ivory/70 hover:text-warm-ivory hover:border-white/25",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-divider/30 py-2 last:border-b-0">
      <span className="text-[12px] text-warm-ivory/45">{label}</span>
      <span className="text-right text-[14px] text-warm-ivory/85">{value}</span>
    </div>
  );
}

export function TextButton({
  onClick,
  children,
}: {
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[11px] uppercase tracking-[0.18em] text-muted-gold transition-colors duration-300 ease-atmospheric hover:text-muted-gold/80"
    >
      {children}
    </button>
  );
}

/** Bottom sheet (mirrors DatePickerSheet's idiom) for edit flows. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/55" onClick={onClose} aria-hidden />
      <div
        className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[88dvh] max-w-[440px] overflow-y-auto rounded-t-[20px] bg-[#0a0a09] px-5 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-4"
        role="dialog"
        aria-label={title}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-[0.2em] text-warm-ivory/55">
            {title}
          </span>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center text-warm-ivory/55 hover:text-warm-ivory"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-2 mt-4 text-[10px] uppercase tracking-[0.18em] text-warm-ivory/45">
      {children}
    </div>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  prefix,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  prefix?: string;
}) {
  return (
    <label className="flex flex-1 flex-col gap-1">
      <span className="text-[11px] text-warm-ivory/45">{label}</span>
      <div className="flex items-center rounded-xl border border-white/[0.10] bg-white/[0.03] px-3">
        {prefix ? <span className="text-[14px] text-warm-ivory/40">{prefix}</span> : null}
        <input
          type="number"
          inputMode="numeric"
          value={value ?? ""}
          onChange={(e) => {
            const n = e.target.value === "" ? null : Number(e.target.value);
            onChange(n != null && Number.isFinite(n) ? n : null);
          }}
          className="w-full bg-transparent py-2 text-[15px] text-warm-ivory focus:outline-none"
        />
      </div>
    </label>
  );
}

export function SaveButton({
  onClick,
  pending,
  label = "Save",
}: {
  onClick: () => void;
  pending?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="mt-6 flex min-h-[52px] w-full items-center justify-center rounded-2xl border border-[#D4AF53] px-5 text-[12px] uppercase tracking-[0.22em] text-[#D4AF53] transition-colors hover:bg-[#D4AF53]/10 disabled:opacity-60"
    >
      {pending ? "Saving…" : label}
    </button>
  );
}
