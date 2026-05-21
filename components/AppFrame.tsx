import type { ReactNode } from "react";

export function AppFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-[440px] flex-col bg-near-black text-warm-ivory">
      <main
        className="flex-1 px-6 pb-36"
        style={{ paddingTop: "calc(var(--safe-top) + 24px)" }}
      >
        {children}
      </main>
    </div>
  );
}
