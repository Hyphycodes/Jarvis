"use client";

import { useState } from "react";

/**
 * Kicks off Finds-grade gift research scoped to this person — their notes and
 * interests are the context, so the results are actually good. Runs as a
 * durable background job; results land back on the gift list and in Finds
 * labeled for them.
 */
export function GiftResearchButton({
  personId,
  personName,
}: {
  personId: string;
  personName: string;
}) {
  const [state, setState] = useState<"idle" | "pending" | "queued" | "error">("idle");

  async function run() {
    if (state === "pending" || state === "queued") return;
    setState("pending");
    try {
      const res = await fetch(`/api/circle/${personId}/gift-research`, { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
      setState("queued");
    } catch (error) {
      console.error("gift research failed", error);
      setState("error");
    }
  }

  if (state === "queued") {
    return (
      <span className="text-[10px] uppercase tracking-[0.2em] text-warm-ivory/45">
        Researching…
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => void run()}
      disabled={state === "pending"}
      className="text-[10px] uppercase tracking-[0.2em] text-muted-gold transition-colors duration-300 ease-atmospheric hover:text-soft-gold disabled:opacity-50"
      aria-label={`Research a gift for ${personName}`}
    >
      {state === "error" ? "Retry" : "Find a gift →"}
    </button>
  );
}
