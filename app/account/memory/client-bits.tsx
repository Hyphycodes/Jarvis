"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { MemoryUpdateProposal } from "@/lib/memory/types";

type Action = "accept" | "reject" | "archive" | "snooze";

export function ProposalReview({
  proposals,
}: {
  proposals: MemoryUpdateProposal[];
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [pending, startTransition] = useTransition();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = proposals.filter((p) => !dismissed.has(p.id));
  const current = visible[0] ?? null;
  const remaining = visible.length;

  function run(action: Action, id: string) {
    startTransition(async () => {
      const res = await fetch("/api/memory/proposals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      if (!res.ok) {
        console.error("memory proposal action failed", await res.text());
        return;
      }
      setDismissed((prev) => new Set([...prev, id]));
      setIndex(0);
      if (action !== "snooze") router.refresh();
    });
  }

  if (!current) {
    return (
      <p className="text-[14px] text-warm-ivory/55">
        All done. Nothing left to review.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {remaining > 1 ? (
        <p className="text-[11px] uppercase tracking-editorial text-warm-ivory/40">
          {remaining} remaining
        </p>
      ) : null}

      <div
        key={current.id}
        className="rounded-2xl border border-white/[0.06] bg-white/[0.015] p-6"
        style={{ animation: "cross-fade 180ms ease" }}
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[10px] uppercase tracking-editorial text-muted-gold">
            {current.type.replace(/_/g, " ")}
          </span>
          <span className="text-[11px] text-warm-ivory/45">
            {Math.round(current.confidence * 100)}% confidence
          </span>
        </div>

        <p className="mt-4 font-serif text-[24px] leading-[1.3] text-warm-ivory">
          {current.content}
        </p>

        <p className="mt-4 text-[14px] leading-[1.55] text-warm-ivory/60">
          {current.reason}
        </p>

        {current.evidence.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-2">
            {current.evidence.map((ev) => (
              <li
                key={ev}
                className="rounded-md border border-white/[0.06] px-2 py-0.5 text-[11px] text-warm-ivory/50"
              >
                {ev}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-8 grid grid-cols-3 gap-3">
          <ActionButton
            label="Accept"
            tone="primary"
            disabled={pending}
            onClick={() => run("accept", current.id)}
          />
          <ActionButton
            label="Snooze 7d"
            tone="muted"
            disabled={pending}
            onClick={() => run("snooze", current.id)}
          />
          <ActionButton
            label="Reject"
            tone="danger"
            disabled={pending}
            onClick={() => run("reject", current.id)}
          />
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  label,
  tone,
  disabled,
  onClick,
}: {
  label: string;
  tone: "primary" | "danger" | "muted";
  disabled: boolean;
  onClick: () => void;
}) {
  const classes =
    tone === "primary"
      ? "border-muted-gold/40 text-muted-gold hover:bg-muted-gold/10 active:bg-muted-gold/20"
      : tone === "danger"
        ? "border-[#E07A6E]/40 text-[#E07A6E] hover:bg-[#E07A6E]/10 active:bg-[#E07A6E]/20"
        : "border-white/[0.08] text-warm-ivory/55 hover:bg-white/[0.03] active:bg-white/[0.05]";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        "w-full rounded-2xl border py-4 text-[13px] uppercase tracking-editorial transition-colors duration-200 ease-atmospheric disabled:opacity-50 " +
        classes
      }
    >
      {label}
    </button>
  );
}

// Keep the old ProposalActions export for any other potential consumers
export function ProposalActions({ proposalId }: { proposalId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const run = (action: Action) => {
    startTransition(async () => {
      const res = await fetch("/api/memory/proposals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: proposalId, action }),
      });
      if (!res.ok) {
        console.error("memory proposal action failed", await res.text());
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="mt-5 flex flex-wrap gap-2">
      <LegacyButton label="Accept" tone="primary" disabled={pending} onClick={() => run("accept")} />
      <LegacyButton label="Reject" tone="danger" disabled={pending} onClick={() => run("reject")} />
      <LegacyButton label="Archive" tone="muted" disabled={pending} onClick={() => run("archive")} />
    </div>
  );
}

function LegacyButton({
  label,
  tone,
  disabled,
  onClick,
}: {
  label: string;
  tone: "primary" | "danger" | "muted";
  disabled: boolean;
  onClick: () => void;
}) {
  const classes =
    tone === "primary"
      ? "border-muted-gold/40 text-muted-gold hover:bg-muted-gold/10"
      : tone === "danger"
        ? "border-[#E07A6E]/40 text-[#E07A6E] hover:bg-[#E07A6E]/10"
        : "border-white/[0.08] text-warm-ivory/55 hover:bg-white/[0.03]";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        "rounded-full border px-4 py-1.5 text-[12px] uppercase tracking-editorial transition-colors duration-300 ease-atmospheric disabled:opacity-50 " +
        classes
      }
    >
      {label}
    </button>
  );
}
