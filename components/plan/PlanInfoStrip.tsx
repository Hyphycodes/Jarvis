import { PlanIcon } from "./icons";
import type { PlanInfoBlock } from "@/lib/plans/planBrief";

/**
 * PlanInfoStrip — four compact blocks of plan intelligence under the hero.
 *
 * Each block: small gold icon + label (uppercase mono) + value (serif)
 * + optional sub-line (small muted). Blocks separated by thin gold
 * verticals. The whole strip sits on a soft-black band.
 *
 * Blocks with `missing: true` are hidden entirely — absent beats invented.
 * A 2-tile strip of real data reads better than a 4-tile strip padded with
 * placeholders. The whole strip hides when nothing real is left.
 */
export function PlanInfoStrip({ blocks }: { blocks: PlanInfoBlock[] }) {
  const visibleBlocks = blocks.filter((b) => !b.missing).slice(0, 4);
  if (visibleBlocks.length === 0) return null;
  return (
    <section
      className="grid items-stretch"
      style={{
        gridTemplateColumns: `repeat(${visibleBlocks.length}, minmax(0, 1fr))`,
        background: "rgba(13, 11, 8, 0.7)",
        borderTop: "1px solid var(--border)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {visibleBlocks.map((b, i) => (
        <div
          key={`${b.label}-${i}`}
          className="flex flex-col items-center px-2 py-4 text-center"
          style={
            i < visibleBlocks.length - 1
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
