import type { ReactNode } from "react";

type Props = {
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
};

export function EditorialHeader({ title, subtitle, meta }: Props) {
  return (
    <header className="flex flex-col gap-3">
      {meta ? (
        <div className="flex items-center justify-between text-[11px] uppercase tracking-editorial text-warm-ivory/60">
          {meta}
        </div>
      ) : null}
      <h1 className="font-serif text-[56px] leading-[1.05] tracking-tight text-warm-ivory">
        {title}
      </h1>
      {subtitle ? (
        <p className="max-w-[34ch] text-[15px] leading-[1.6] text-warm-ivory/70">
          {subtitle}
        </p>
      ) : null}
      <div className="mt-2 h-px w-10 bg-muted-gold/70" />
    </header>
  );
}
