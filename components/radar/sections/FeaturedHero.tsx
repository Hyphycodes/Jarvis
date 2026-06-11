"use client";

import Link from "next/link";
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
 * The featured hero — the strongest surfaced item for the category. Image on
 * the left half, gold label + serif name + two-line reason + VIEW DETAILS on
 * the right.
 */
export function FeaturedHero({
  label,
  card,
  href,
}: {
  label: string;
  card: Card;
  href: string;
}) {
  return (
    <section className="mt-9">
      <h2 className="text-[10px] uppercase tracking-[0.2em] text-warm-ivory/45">
        {label}
      </h2>
      <Link
        href={href}
        className="lux-surface mt-3 block overflow-hidden rounded-[var(--radius-card)] transition-colors duration-300 ease-atmospheric hover:bg-white/[0.012]"
        aria-label={`Open ${card.title}`}
      >
        <div className="grid grid-cols-[44%_1fr]">
          <Thumb src={card.imageUrl} alt={card.title} className="h-full min-h-[210px]" />
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
            <div className="mt-auto pt-4 text-[10px] uppercase tracking-[0.2em] text-muted-gold">
              View details →
            </div>
          </div>
        </div>
      </Link>
    </section>
  );
}
