"use client";

import { useState, useTransition } from "react";
import { createTasteSignal } from "@/lib/actions/taste";
import type { SignalDirection } from "@/lib/types/database";

export function CreateTasteSignal() {
  const [open, setOpen] = useState(false);
  const [trait, setTrait] = useState("");
  const [direction, setDirection] = useState<SignalDirection>("positive");
  const [category, setCategory] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (!trait.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        await createTasteSignal({
          trait: trait.trim(),
          direction,
          category: category.trim() || undefined,
          weight: 1.0,
          confidence: 0.5,
        });
        setTrait("");
        setCategory("");
        setDirection("positive");
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start text-[11px] uppercase tracking-editorial text-muted-gold transition-colors duration-300 ease-atmospheric hover:text-soft-gold"
      >
        + Add signal
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3 border border-divider bg-soft-black/40 p-4">
      <input
        value={trait}
        onChange={(e) => setTrait(e.target.value)}
        placeholder="Observation, written tight (e.g. 'quiet cigar lounge')"
        disabled={pending}
        className="w-full border border-divider bg-transparent px-2 py-1.5 text-[14px] text-warm-ivory placeholder-warm-ivory/35 outline-none focus:border-muted-gold/70"
      />
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={direction}
          onChange={(e) => setDirection(e.target.value as SignalDirection)}
          disabled={pending}
          className="border border-divider bg-near-black px-2 py-1 text-[11px] uppercase tracking-editorial text-warm-ivory/85 outline-none"
        >
          <option value="positive">Positive</option>
          <option value="negative">Negative</option>
        </select>
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="category (optional)"
          disabled={pending}
          className="flex-1 border border-divider bg-transparent px-2 py-1 text-[12px] text-warm-ivory placeholder-warm-ivory/30 outline-none focus:border-muted-gold/60"
        />
      </div>
      {error ? (
        <div className="text-[11px] text-muted-gold/85">{error}</div>
      ) : null}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={pending || !trait.trim()}
          className="text-[11px] uppercase tracking-editorial text-muted-gold disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save signal"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setTrait("");
            setError(null);
          }}
          disabled={pending}
          className="text-[11px] uppercase tracking-editorial text-warm-ivory/45"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
