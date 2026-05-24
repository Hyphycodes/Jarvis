import type { ReactNode } from "react";

/**
 * PlanShell — full-bleed wrapper used by every plan page (main + chapters).
 *
 * Provides the consistent vertical rhythm: safe-area top, max-width
 * column, nav-aware bottom padding so content never hides under the
 * BottomNav. No internal padding-x — children control horizontal padding
 * so the hero can go full-bleed while body sections stay padded.
 */
export function PlanShell({ children }: { children: ReactNode }) {
  return (
    <div className="lux-page relative mx-auto flex min-h-[100dvh] w-full max-w-[440px] flex-col overflow-x-hidden text-warm-ivory">
      <main
        className="smooth-page flex-1"
        style={{
          paddingTop: "calc(var(--safe-top) + 12px)",
          paddingBottom: "calc(var(--nav-total-h) + 48px)",
        }}
      >
        {children}
      </main>
    </div>
  );
}
