import type { ReactNode } from "react";

export function AppFrame({ children }: { children: ReactNode }) {
  return (
    <div className="lux-page relative mx-auto flex min-h-[100dvh] w-full max-w-[440px] flex-col overflow-x-hidden text-warm-ivory">
      <main
        className="smooth-page flex-1 px-6"
        style={{
          paddingTop: "calc(var(--safe-top) + 24px)",
          paddingBottom: "calc(var(--nav-total-h) + 48px)",
        }}
      >
        {children}
      </main>
    </div>
  );
}
