import Link from "next/link";
import { ChevronRightIcon, PlanIcon } from "./icons";
import type { PlanChapter } from "@/lib/plans/planBrief";

/**
 * PlanChapterRow — one row in the chapter list on the main plan page.
 *
 * Layout: gold icon | title (uppercase letterspaced) + description
 * + optional confirmation line | chevron
 *
 * The confirmation line is the "brain pass" signal — when present, it
 * renders subtly in gold-soft italic to tell the user that the chapter
 * has already been considered.
 */
export function PlanChapterRow({ chapter }: { chapter: PlanChapter }) {
  return (
    <Link
      href={chapter.href}
      prefetch
      className="block transition-colors duration-300 ease-atmospheric hover:bg-white/[0.012]"
    >
      <div
        className="grid grid-cols-[44px_minmax(0,1fr)_24px] items-start gap-4 px-5 py-5"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="pt-1">
          <PlanIcon name={chapter.icon} size={22} stroke="var(--gold)" />
        </div>
        <div className="min-w-0">
          <div
            className="font-mono uppercase"
            style={{
              color: "var(--text-primary)",
              fontSize: "13px",
              letterSpacing: "0.2em",
            }}
          >
            {chapter.title}
          </div>
          <p
            className="mt-2 text-[13px] leading-[1.5]"
            style={{ color: "var(--text-muted)" }}
          >
            {chapter.description}
          </p>
          {chapter.confirmation ? (
            <p
              className="mt-1.5 font-serif italic text-[12px] leading-[1.45]"
              style={{ color: "var(--gold-soft)" }}
            >
              {chapter.confirmation}
            </p>
          ) : null}
        </div>
        <div className="flex h-full items-center justify-end pt-1">
          <ChevronRightIcon size={16} stroke="var(--text-muted)" />
        </div>
      </div>
    </Link>
  );
}
