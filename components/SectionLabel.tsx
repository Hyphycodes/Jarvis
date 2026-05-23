import type { ReactNode } from "react";

export function SectionLabel({
  children,
  trailing,
}: {
  children: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.22em] text-warm-ivory/70">
      <span>{children}</span>
      {trailing ? <span className="text-muted-gold/80">{trailing}</span> : null}
    </div>
  );
}
