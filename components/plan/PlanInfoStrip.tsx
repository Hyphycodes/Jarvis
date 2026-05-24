import { PlanIcon } from "./icons";
import type { PlanInfoBlock } from "@/lib/plans/planBrief";

/**
 * PlanInfoStrip — four compact blocks of plan intelligence under the hero.
 *
 * Each block: small gold icon + label (uppercase mono) + value (serif)
 * + optional sub-line (small muted). Blocks separated by thin gold
 * verticals. The whole strip sits on a soft-black band.
 *
 * `missing` blocks render in muted tones so the page is honest about
 * what's not yet wired without looking broken.
 */
export function PlanInfoStrip({ blocks }: { blocks: PlanInfoBlock[] }) {
  if (blocks.length === 0) return null;
  return (
    <section
      className="grid grid-cols-4 items-stretch"
      style={{
        background: "rgba(13, 11, 8, 0.7)",
        borderTop: "1px solid var(--border)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {blocks.slice(0, 4).map((b, i) => (
        <div
          key={`${b.label}-${i}`}
          className="flex flex-col items-center px-2 py-4 text-center"
          style={
            i < blocks.length - 1
              ? { borderRight: "1px solid var(--border)" }
              : undefined
          }
        >
          {b.icon ? (
            <PlanIcon
              name={b.icon}
              size={18}
              stroke={b.missing ? "var(--text-faint)" : "var(--gold)"}
            />
          ) : null}
          <div
            className="mt-2 font-mono text-[9px] uppercase tracking-[0.18em]"
            style={{ color: "var(--text-muted)" }}
          >
            {b.label}
          </div>
          <div
            className="mt-1 font-serif"
            style={{
              color: b.missing ? "var(--text-muted)" : "var(--text-primary)",
              fontSize: "18px",
              lineHeight: 1.1,
            }}
          >
            {b.value}
          </div>
          {b.sub ? (
            <div
              className="mt-1 text-[10px]"
              style={{ color: "var(--text-faint)" }}
            >
              {b.sub}
            </div>
          ) : null}
        </div>
      ))}
    </section>
  );
}
