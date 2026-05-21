import type { ReactNode } from "react";

type Props = {
  title: string;
  date: string;
  titleItalic?: boolean;
  copy: ReactNode;
  visual: ReactNode;
  headline: string;
  subcopy?: ReactNode;
  /** CTAs, chips, or rows specific to the tab */
  actions?: ReactNode;
};

/**
 * Editorial shell for a logged-out tab. Keeps the rhythm:
 *   eyebrow row (title-cased) + date · serif title · subtitle copy ·
 *   atmospheric visual · serif headline · subcopy · tab-specific actions.
 */
export function EmptyTab({
  title,
  date,
  titleItalic = false,
  copy,
  visual,
  headline,
  subcopy,
  actions,
}: Props) {
  return (
    <div className="flex flex-col">
      <header className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-4">
          <h1
            className={
              "font-serif text-[40px] leading-[1.02] tracking-[-0.01em] text-warm-ivory " +
              (titleItalic ? "italic" : "")
            }
          >
            {title}
          </h1>
          <span className="pt-3 text-[11px] uppercase tracking-editorial text-warm-ivory/55">
            {date}
          </span>
        </div>
        <p className="max-w-[40ch] text-[14px] leading-[1.55] text-warm-ivory/65">
          {copy}
        </p>
      </header>

      <div className="ambient-visual mt-10">{visual}</div>

      <div className="motion-card mt-8 flex flex-col items-center text-center">
        <Star />
        <h2 className="mt-3 font-serif text-[26px] leading-[1.15] tracking-[-0.005em] text-warm-ivory">
          {headline}
        </h2>
        {subcopy ? (
          <p className="mt-2 max-w-[34ch] text-[13px] leading-[1.55] text-warm-ivory/55">
            {subcopy}
          </p>
        ) : null}
      </div>

      {actions ? <div className="motion-card mt-6">{actions}</div> : null}
    </div>
  );
}

function Star() {
  return (
    <span aria-hidden className="block text-[14px] text-muted-gold/85">
      ✦
    </span>
  );
}
