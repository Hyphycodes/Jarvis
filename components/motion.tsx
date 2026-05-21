import type { ReactNode } from "react";

export function SmoothPage({ children }: { children: ReactNode }) {
  return <div className="smooth-page">{children}</div>;
}

export function MotionCard({ children }: { children: ReactNode }) {
  return <div className="motion-card">{children}</div>;
}
