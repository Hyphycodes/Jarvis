"use client";

import type { ReactNode } from "react";
import { Ellipsis, Share } from "./icons";
import { BackButton } from "./BackButton";

type Props = {
  /** Centered uppercase label that names the section, e.g. "BEFORE YOU GO". */
  eyebrow: string;
  /** Route to return to when back is tapped. Defaults to the Plan Hub. */
  backHref?: string;
  /** Hide the share/more cluster top-right. Some sections (rare) may want a clean top. */
  hideMeta?: boolean;
  children: ReactNode;
};

/**
 * Wrapper for plan deep-section pages. Provides:
 * - Top chrome: back arrow, centered eyebrow label, share + ellipsis
 * - Safe-area aware top padding
 * - Extra bottom padding (no global bottom nav on deep sections)
 */
export function DeepSectionFrame({
  eyebrow,
  backHref = "/plan/sparrow",
  hideMeta = false,
  children,
}: Props) {
  return (
    <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-[440px] flex-col bg-near-black text-warm-ivory">
      <main
        className="flex-1 px-6"
        style={{
          paddingTop: "calc(env(safe-area-inset-top) + 16px)",
          paddingBottom: "calc(env(safe-area-inset-bottom) + 40px)",
        }}
      >
        <div className="relative grid grid-cols-[40px_1fr_auto] items-center">
          <BackButton fallbackHref={backHref} />
          <div className="text-center text-[11px] uppercase tracking-editorial text-muted-gold">
            {eyebrow}
          </div>
          {hideMeta ? (
            <span />
          ) : (
            <div className="flex items-center gap-2 justify-self-end text-warm-ivory/70">
              <button
                type="button"
                aria-label="Share"
                className="flex h-9 w-9 items-center justify-center transition-colors duration-300 ease-atmospheric hover:text-warm-ivory"
              >
                <Share size={14} />
              </button>
              <button
                type="button"
                aria-label="More"
                className="flex h-9 w-9 items-center justify-center transition-colors duration-300 ease-atmospheric hover:text-warm-ivory"
              >
                <Ellipsis size={16} />
              </button>
            </div>
          )}
        </div>
        <div className="mt-6">{children}</div>
      </main>
    </div>
  );
}

export function DeepHeader({
  title,
  subtitle,
  meta,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3">
      <h1 className="font-serif text-[44px] italic leading-[1.02] tracking-[-0.01em] text-warm-ivory">
        {title}
      </h1>
      {subtitle ? (
        <p className="font-serif text-[16px] italic leading-[1.45] text-warm-ivory/75">
          {subtitle}
        </p>
      ) : null}
      {meta ? (
        <div className="mt-1 text-[11px] uppercase tracking-editorial text-warm-ivory/55">
          {meta}
        </div>
      ) : null}
    </header>
  );
}
