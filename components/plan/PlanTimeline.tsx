import type { PlanMoveItem } from "@/lib/plans/planBrief";

/**
 * PlanTimeline — vertical timeline matching The Move reference.
 *
 * Layout: time column (84px) | rail w/ circles | content (italic serif
 * title, italic body, optional uppercase note). Gold rail runs between
 * the first and last circle; circles are open gold rings.
 */
export function PlanTimeline({ items }: { items: PlanMoveItem[] }) {
  if (items.length === 0) return null;
  return (
    <ol className="relative mt-8 px-5">
      <span
        aria-hidden
        className="absolute w-px"
        style={{
          left: "calc(84px + 13px)",      // 84px time column + half circle
          top: 24,
          bottom: 24,
          background: "rgba(184,137,55,0.45)",
        }}
      />
      {items.map((item, idx) => (
        <li
          key={`${item.title}-${idx}`}
          className="relative grid grid-cols-[84px_28px_minmax(0,1fr)] gap-x-4"
          style={{ paddingTop: idx === 0 ? 0 : 22, paddingBottom: 22 }}
        >
          {/* Time column */}
          <div
            className="pt-1 font-mono text-[12px] uppercase tracking-[0.08em]"
            style={{ color: "var(--text-muted)" }}
          >
            {item.time && item.time !== "—" ? item.time : " "}
          </div>

          {/* Circle */}
          <div className="relative flex justify-center pt-2">
            <span
              aria-hidden
              className="block h-3.5 w-3.5 rounded-full"
              style={{
                border: "1.5px solid var(--gold)",
                background: "var(--bg)",
              }}
            />
          </div>

          {/* Content */}
          <div className="min-w-0 pb-2">
            <h3
              className="font-serif italic"
              style={{
                color: "var(--text-primary)",
                fontSize: "26px",
                lineHeight: 1.1,
                letterSpacing: "-0.005em",
              }}
            >
              {item.title}
            </h3>
            <p
              className="mt-2 font-serif italic"
              style={{
                color: "var(--text-muted)",
                fontSize: "15px",
                lineHeight: 1.5,
              }}
            >
              {item.body}
            </p>
            {item.note ? (
              <p
                className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em]"
                style={{ color: "var(--gold-soft)" }}
              >
                {item.note}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
