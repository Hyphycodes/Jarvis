import type { ReactNode } from "react";

type Props = {
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  rule?: boolean;
  size?: "display" | "section";
};

export function EditorialHeader({
  title,
  subtitle,
  meta,
  rule = false,
  size = "display",
}: Props) {
  const titleClass =
    size === "display"
      ? "font-serif text-[64px] leading-[1.02] tracking-[-0.01em] text-warm-ivory"
      : "font-serif text-[44px] leading-[1.05] tracking-[-0.01em] text-warm-ivory";
  return (
    <header className="flex flex-col gap-4">
      {meta ? (
        <div className="flex items-center justify-between text-[13px] text-warm-ivory/65">
          {meta}
        </div>
      ) : null}
      <h1 className={titleClass}>{title}</h1>
      {subtitle ? (
        <p className="max-w-[42ch] text-[15px] leading-[1.55] text-warm-ivory/65">
          {subtitle}
        </p>
      ) : null}
      {rule ? <div className="mt-1 h-px w-10 bg-muted-gold/70" /> : null}
    </header>
  );
}
