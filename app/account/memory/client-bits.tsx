"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

type Action = "accept" | "reject" | "archive";

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
      <ProposalButton
        label="Accept"
        tone="primary"
        disabled={pending}
        onClick={() => run("accept")}
      />
      <ProposalButton
        label="Reject"
        tone="danger"
        disabled={pending}
        onClick={() => run("reject")}
      />
      <ProposalButton
        label="Archive"
        tone="muted"
        disabled={pending}
        onClick={() => run("archive")}
      />
    </div>
  );
}

function ProposalButton({
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
