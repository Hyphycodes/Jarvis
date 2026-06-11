"use client";

import Link from "next/link";
import { useState } from "react";
import type { Card } from "./types";
import { Thumb } from "./Thumb";

function heroBadge(card: Card): string {
  if (card.filter === "Finds") {
    switch (card.budgetTier) {
      case "attainable":
        return "ATTAINABLE FIND";
      case "premium-realistic":
        return "PREMIUM FIND";
      case "aspirational":
        return "ASPIRATIONAL FIND";
      default:
        return "FIND";
    }
  }
  return card.category;
}

/**
 * The featured hero — the strongest surfaced item for the category. The plan
 * behind it is already built (the readiness contract guarantees it), so the
 * card is a decided move: YES drops it onto the calendar and Today, PASS kills
 * it and the next-strongest takes the slot. Tapping the card opens the plan.
 * Finds keep their buyer flow: View opens the dossier.
 */
export function FeaturedHero({
  label,
  card,
  href,
  onYes,
  onPass,
}: {
  label: string;
  card: Card;
  href: string;
  onYes: (card: Card) => Promise<void>;
  onPass: (card: Card) => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const isFind = card.filter === "Finds";

  async function run(action: (card: Card) => Promise<void>) {
    if (pending) return;
    setPending(true);
    try {
      await action(card);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="mt-6">
      <h2 className="text-[10px] uppercase tracking-[0.2em] text-warm-ivory/45">
        {label}
      </h2>
      <article className="lux-surface mt-3 overflow-hidden rounded-[var(--radius-card)]">
        <Link
          href={href}
          className="block transition-colors duration-300 ease-atmospheric hover:bg-white/[0.012]"
          aria-label={`Open ${card.title}`}
        >
          <div className="grid grid-cols-[44%_1fr]">
            <Thumb src={card.imageUrl} alt={card.title} className="h-full min-h-[200px]" />
            <div className="flex flex-col p-5">
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-gold">
                {heroBadge(card)}
              </div>
              <h3 className="mt-2 font-serif text-[26px] leading-[1.08] text-warm-ivory">
                {card.title}
              </h3>
              <p className="mt-2 text-[13px] leading-[1.5] text-warm-ivory/62 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] overflow-hidden">
                {card.body}
              </p>
              {card.meta.length > 0 ? (
                <div className="mt-auto pt-3 text-[10px] uppercase tracking-[0.18em] text-warm-ivory/40">
                  {card.meta[0]}
                </div>
              ) : null}
            </div>
          </div>
        </Link>
        <div className="grid grid-cols-2 border-t border-white/[0.045]">
          {isFind ? (
            <Link
              href={href}
              className="border-r border-white/[0.045] py-3.5 text-center text-[11px] uppercase tracking-[0.22em] text-muted-gold transition-colors duration-300 ease-atmospheric hover:text-soft-gold"
            >
              View
            </Link>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={() => void run(onYes)}
              className="border-r border-white/[0.045] py-3.5 text-[11px] uppercase tracking-[0.22em] text-muted-gold transition-colors duration-300 ease-atmospheric hover:text-soft-gold disabled:opacity-60"
            >
              Yes
            </button>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={() => void run(onPass)}
            className="py-3.5 text-[11px] uppercase tracking-[0.22em] text-warm-ivory/50 transition-colors duration-300 ease-atmospheric hover:text-warm-ivory/80 disabled:opacity-60"
          >
            Pass
          </button>
        </div>
      </article>
    </section>
  );
}
