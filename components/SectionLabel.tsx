import type { ReactNode } from "react";

export function SectionLabel({
  children,
  trailing,
}: {
  children: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between text-[11px] uppercase tracking-editorial text-warm-ivory/55">
      <span>{children}</span>
      {trailing ? <span className="text-warm-ivory/70">{trailing}</span> : null}
    </div>
  );
}
