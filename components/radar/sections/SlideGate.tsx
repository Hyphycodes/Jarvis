"use client";

import { useRef, type ReactNode } from "react";

/**
 * Defers rendering of a carousel slide until it has been at (or adjacent to)
 * the selected index once; afterwards it stays mounted so scroll position and
 * in-flight state survive swiping away and back.
 */
export function SlideGate({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  const visited = useRef(false);
  if (active) visited.current = true;
  if (!visited.current) {
    return <div aria-hidden className="min-h-[100dvh]" />;
  }
  return <>{children}</>;
}
