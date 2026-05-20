import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  bordered?: boolean;
};

export function AtmosphericCard({
  children,
  className = "",
  bordered = false,
}: Props) {
  return (
    <div
      className={
        "rounded-[12px] bg-soft-black/80 backdrop-blur-sm transition-opacity duration-500 ease-atmospheric " +
        (bordered ? "border border-divider/70 " : "") +
        className
      }
      style={{ boxShadow: "0 24px 64px -32px rgba(0,0,0,0.8)" }}
    >
      {children}
    </div>
  );
}
