"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  recordExperienceMemory,
  type ExperienceRating,
  type ExperienceMemory,
} from "@/lib/actions/experienceMemory";

const RATINGS: { value: ExperienceRating; label: string }[] = [
  { value: "loved", label: "Loved it" },
  { value: "good", label: "Good" },
  { value: "meh", label: "Meh" },
  { value: "not_for_me", label: "Not for me" },
];

/**
 * AFTER capture — record how the experience actually went. Calm + fast: a
 * rating, would-return, notes, optional spend/companions. Submits a server
 * action that stores the memory + a structured taste signal. Photos are
 * schema-first (no UI yet).
 */
export function ExperienceCapture({
  planId,
  sourceItemId,
  venueName,
  existing,
}: {
  planId?: string | null;
  sourceItemId?: string | null;
  venueName?: string | null;
  existing?: ExperienceMemory | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(Boolean(existing));
  const [error, setError] = useState<string | null>(null);

  const [rating, setRating] = useState<ExperienceRating | null>(existing?.rating ?? null);
  const [wouldReturn, setWouldReturn] = useState<boolean | null>(existing?.wouldReturn ?? null);
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [spend, setSpend] = useState(
    existing?.spendAmount != null ? String(existing.spendAmount) : "",
  );
  const [companions, setCompanions] = useState((existing?.companions ?? []).join(", "));

  function submit() {
    if (!rating) {
      setError("Pick how it went first.");
      return;
    }
    setError(null);
    const spendNum = spend.trim() ? Number(spend.replace(/[^0-9.]/g, "")) : null;
    const companionList = companions
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    startTransition(async () => {
      try {
        await recordExperienceMemory({
          planId: planId ?? null,
          sourceItemId: sourceItemId ?? null,
          rating,
          wouldReturn,
          notes: notes.trim() || null,
          spendAmount: spendNum != null && Number.isFinite(spendNum) ? spendNum : null,
          companions: companionList.length ? companionList : null,
        });
        setSaved(true);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save.");
      }
    });
  }

  return (
    <section className="mt-12 px-5">
      <div
        className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5"
        style={{ borderColor: "rgba(208,173,104,0.18)" }}
      >
        <div className="text-[10px] uppercase tracking-[0.2em]" style={{ color: "var(--gold-soft)" }}>
          {saved ? "Recorded" : "How was it?"}
        </div>
        <h3 className="mt-2 font-serif text-[22px] italic leading-tight text-warm-ivory">
          {venueName ? `Looking back on ${venueName}.` : "Looking back."}
        </h3>

        {/* Rating */}
        <div className="mt-5 grid grid-cols-2 gap-2">
          {RATINGS.map((r) => {
            const active = rating === r.value;
            return (
              <button
                key={r.value}
                type="button"
                onClick={() => setRating(r.value)}
                className="min-h-[44px] rounded-xl border text-[12px] uppercase tracking-[0.14em] transition-colors duration-300 ease-atmospheric"
                style={{
                  borderColor: active ? "rgba(208,173,104,0.7)" : "rgba(255,250,240,0.10)",
                  background: active ? "rgba(184,137,55,0.10)" : "transparent",
                  color: active ? "var(--gold)" : "var(--text-muted)",
                }}
              >
                {r.label}
              </button>
            );
          })}
        </div>

        {/* Would return */}
        <div className="mt-5 flex items-center justify-between">
          <span className="text-[13px] text-warm-ivory/70">Would you go back?</span>
          <div className="flex gap-2">
            {[
              { v: true, l: "Yes" },
              { v: false, l: "No" },
            ].map(({ v, l }) => {
              const active = wouldReturn === v;
              return (
                <button
                  key={l}
                  type="button"
                  onClick={() => setWouldReturn(active ? null : v)}
                  className="min-h-[36px] rounded-lg border px-4 text-[12px] uppercase tracking-[0.14em] transition-colors duration-300 ease-atmospheric"
                  style={{
                    borderColor: active ? "rgba(208,173,104,0.7)" : "rgba(255,250,240,0.10)",
                    color: active ? "var(--gold)" : "var(--text-muted)",
                  }}
                >
                  {l}
                </button>
              );
            })}
          </div>
        </div>

        {/* Notes */}
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="What stood out? Anything worth remembering for next time."
          rows={3}
          className="mt-5 w-full resize-none rounded-xl border bg-transparent p-3 font-serif text-[15px] text-warm-ivory placeholder:text-warm-ivory/30 focus:outline-none"
          style={{ borderColor: "rgba(255,250,240,0.10)" }}
        />

        {/* Optional spend + companions */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <input
            value={spend}
            onChange={(e) => setSpend(e.target.value)}
            inputMode="decimal"
            placeholder="Spend ($)"
            className="min-h-[40px] rounded-xl border bg-transparent px-3 text-[14px] text-warm-ivory placeholder:text-warm-ivory/30 focus:outline-none"
            style={{ borderColor: "rgba(255,250,240,0.10)" }}
          />
          <input
            value={companions}
            onChange={(e) => setCompanions(e.target.value)}
            placeholder="Who with"
            className="min-h-[40px] rounded-xl border bg-transparent px-3 text-[14px] text-warm-ivory placeholder:text-warm-ivory/30 focus:outline-none"
            style={{ borderColor: "rgba(255,250,240,0.10)" }}
          />
        </div>

        {error ? (
          <p className="mt-3 text-[12px]" style={{ color: "#E07A6E" }}>
            {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="mt-5 flex w-full items-center justify-center rounded-md py-3.5 text-[11px] uppercase tracking-[0.22em] transition-opacity duration-300 ease-atmospheric disabled:opacity-60"
          style={{ background: "var(--text-primary)", color: "var(--bg)" }}
        >
          {pending ? "Saving…" : saved ? "Update reflection" : "Save reflection"}
        </button>
      </div>
    </section>
  );
}
