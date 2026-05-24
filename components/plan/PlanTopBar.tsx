"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShareIcon, MoreIcon } from "./icons";

/**
 * PlanTopBar — consistent header strip across all plan pages.
 *
 * Two modes:
 *   - main hero (eyebrowDate on the right): used on /plan/[slug]
 *   - chapter (eyebrowCenter): used on /plan/[slug]/before, /move, etc.
 *
 * Back button uses Next.js router.back() when no explicit `backHref`
 * is provided so the user always returns to where they came from.
 */
export function PlanTopBar({
  backHref,
  eyebrowDate,
  eyebrowCenter,
  showShare = false,
  showMore = false,
}: {
  backHref?: string;
  /** Right-aligned monospaced date label, used on the main plan page. */
  eyebrowDate?: string;
  /** Centered monospaced eyebrow, used on chapter sub-pages. */
  eyebrowCenter?: string;
  showShare?: boolean;
  showMore?: boolean;
}) {
  const router = useRouter();
  const onBack = () => {
    if (backHref) return; // Link handles it
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/");
    }
  };

  const backButton = (
    <BackButton onClick={!backHref ? onBack : undefined} />
  );

  return (
    <div className="relative flex items-center justify-between px-5 py-4">
      <div className="flex items-center">
        {backHref ? (
          <Link href={backHref} aria-label="Back" prefetch>
            {backButton}
          </Link>
        ) : (
          backButton
        )}
      </div>

      {eyebrowCenter ? (
        <span
          className="pointer-events-none absolute left-1/2 -translate-x-1/2 font-mono text-[11px] uppercase tracking-[0.18em]"
          style={{ color: "var(--gold)" }}
        >
          {eyebrowCenter}
        </span>
      ) : null}

      {eyebrowDate ? (
        <span
          className="font-mono text-[11px] uppercase tracking-[0.16em]"
          style={{ color: "var(--text-muted)" }}
        >
          {eyebrowDate}
        </span>
      ) : null}

      {(showShare || showMore) && !eyebrowDate ? (
        <div className="flex items-center gap-2">
          {showShare ? <CircleIconButton ariaLabel="Share"><ShareIcon size={14} /></CircleIconButton> : null}
          {showMore ? <CircleIconButton ariaLabel="More"><MoreIcon size={14} /></CircleIconButton> : null}
        </div>
      ) : null}
    </div>
  );
}

function BackButton({ onClick }: { onClick?: () => void }) {
  return (
    <button
      type="button"
      aria-label="Back"
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-full transition-colors duration-300 ease-atmospheric active:translate-y-px"
      style={{
        border: "1px solid var(--border)",
        color: "var(--text-primary)",
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M14 6l-6 6 6 6"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

function CircleIconButton({
  ariaLabel,
  children,
}: {
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      className="flex h-9 w-9 items-center justify-center rounded-full transition-colors duration-300 ease-atmospheric active:translate-y-px"
      style={{
        border: "1px solid var(--border)",
        color: "var(--text-primary)",
      }}
    >
      {children}
    </button>
  );
}
