"use client";

import { useState, useTransition } from "react";
import { createMemoryItem } from "@/lib/actions/memory";
import type { MemoryKind } from "@/lib/types/database";

const KINDS: MemoryKind[] = [
  "identity",
  "preference",
  "pattern",
  "principle",
  "context",
];

export function CreateMemoryItem() {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [kind, setKind] = useState<MemoryKind>("preference");
  const [pinned, setPinned] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (!content.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        await createMemoryItem({
          content: content.trim(),
          kind,
          confidence: 0.6,
          is_pinned: pinned,
        });
        setContent("");
        setKind("preference");
        setPinned(false);
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
        + Add memory
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3 border border-divider bg-soft-black/40 p-4">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
        placeholder="Write the insight as an observation. Be specific."
        disabled={pending}
        className="w-full resize-none border border-divider bg-transparent p-2 text-[14px] leading-[1.5] text-warm-ivory placeholder-warm-ivory/35 outline-none focus:border-muted-gold/70"
      />
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as MemoryKind)}
          disabled={pending}
          className="border border-divider bg-near-black px-2 py-1 text-[11px] uppercase tracking-editorial text-warm-ivory/85 outline-none"
        >
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-[11px] uppercase tracking-editorial text-warm-ivory/70">
          <input
            type="checkbox"
            checked={pinned}
            onChange={(e) => setPinned(e.target.checked)}
            disabled={pending}
          />
          Pin
        </label>
      </div>
      {error ? (
        <div className="text-[11px] text-muted-gold/85">{error}</div>
      ) : null}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={pending || !content.trim()}
          className="text-[11px] uppercase tracking-editorial text-muted-gold disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save memory"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setContent("");
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
