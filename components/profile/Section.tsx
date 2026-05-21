import type { ReactNode } from "react";

type Props = {
  eyebrow: string;
  title?: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
};

export function Section({
  eyebrow,
  title,
  description,
  trailing,
  children,
}: Props) {
  return (
    <section className="border-t border-divider/70 pt-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-editorial text-muted-gold">
            {eyebrow}
          </div>
          {title ? (
            <h2 className="mt-2 font-serif text-[28px] italic leading-[1.1] tracking-[-0.01em] text-warm-ivory">
              {title}
            </h2>
          ) : null}
          {description ? (
            <p className="mt-2 max-w-[42ch] font-serif text-[14px] italic leading-[1.5] text-warm-ivory/60">
              {description}
            </p>
          ) : null}
        </div>
        {trailing ? <div className="shrink-0">{trailing}</div> : null}
      </header>
      <div className="flex flex-col gap-5">{children}</div>
    </section>
  );
}

export function FieldRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-start gap-4 border-b border-divider/40 py-3">
      <div className="text-[10px] uppercase tracking-editorial text-warm-ivory/45">
        {label}
      </div>
      <div className="min-w-0 text-[14px] leading-[1.5] text-warm-ivory/85">
        {children}
      </div>
    </div>
  );
}
