"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function PlanDispositionBar({
  itemId,
  planSlug,
}: {
  itemId: string;
  planSlug: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);

  async function act(action: "move-holding" | "pass") {
    setPending(action);
    try {
      await fetch(`/api/items/${itemId}/${action}`, { method: "POST" });
      router.push("/radar");
    } catch {
      setPending(null);
    }
  }

  return (
    <div
      className="mt-8 flex flex-col gap-3 px-5 pb-10"
      style={{ borderTop: "1px solid var(--border)", paddingTop: "32px" }}
    >
      <button
        type="button"
        onClick={() => act("move-holding")}
        disabled={pending !== null}
        className="w-full border border-warm-ivory/20 py-4 text-[11px] uppercase tracking-[0.2em] text-warm-ivory/60 transition-colors hover:border-warm-ivory/40 hover:text-warm-ivory/80 disabled:opacity-40"
      >
        {pending === "move-holding" ? "Moving…" : "Wait"}
      </button>
      <button
        type="button"
        onClick={() => act("pass")}
        disabled={pending !== null}
        className="w-full py-3 text-[11px] uppercase tracking-[0.2em] text-warm-ivory/35 transition-colors hover:text-warm-ivory/55 disabled:opacity-40"
      >
        {pending === "pass" ? "Passing…" : "Pass"}
      </button>
    </div>
  );
}
