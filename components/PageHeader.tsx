import type { ReactNode } from "react";
import { BackButton } from "./BackButton";

type Props = {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  rightAction?: ReactNode;
  /**
   * Where Back should land if there's no history (deep-link, refresh).
   * Defaults to `/`.
   */
  backHref?: string;
  /**
   * Root tabs pass `isRoot` so no back arrow renders.
   */
  isRoot?: boolean;
};

export function PageHeader({
  eyebrow,
  title,
  description,
  rightAction,
  backHref = "/",
  isRoot = false,
}: Props) {
  return (
    <header>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          {isRoot ? null : <BackButton fallbackHref={backHref} />}
          <span className="text-[11px] uppercase tracking-editorial text-muted-gold">
            {eyebrow}
          </span>
        </div>
        {rightAction ? <div>{rightAction}</div> : null}
      </div>

      <h1 className="mt-6 font-serif text-[52px] italic leading-[1.0] tracking-[-0.01em] text-warm-ivory">
        {title}
      </h1>

      {description ? (
        <p className="mt-4 max-w-[40ch] font-serif text-[18px] italic leading-[1.3] text-warm-ivory/65">
          {description}
        </p>
      ) : null}
    </header>
  );
}
