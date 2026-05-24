/**
 * PlanQuoteCard — italic serif quote with a quotation mark hairline,
 * optional thumbnail on the right, attribution at the bottom-left.
 *
 * The thumbnail uses an atmospheric radial-gradient placeholder when no
 * image is provided — keeps the card consistent across all plans.
 */
export function PlanQuoteCard({
  body,
  attribution,
  showThumbnail = true,
}: {
  body: string;
  attribution?: string;
  showThumbnail?: boolean;
}) {
  return (
    <section className="mx-5 mt-10">
      <div
        className="relative grid grid-cols-[minmax(0,1fr)_104px] gap-5 rounded-[var(--radius-card)] p-5"
        style={{
          border: "1px solid var(--border)",
          background:
            "linear-gradient(180deg, rgba(246,239,221,0.022), rgba(0,0,0,0.05))",
        }}
      >
        <div className="min-w-0">
          <span
            aria-hidden
            className="block font-serif"
            style={{
              color: "var(--gold-soft)",
              fontSize: "32px",
              lineHeight: 1,
              opacity: 0.6,
            }}
          >
            “
          </span>
          <p
            className="mt-1 font-serif italic"
            style={{
              color: "var(--text-primary)",
              fontSize: "15px",
              lineHeight: 1.5,
            }}
          >
            {body}
          </p>
          {attribution ? (
            <div
              className="mt-4 font-serif italic"
              style={{ color: "var(--text-muted)", fontSize: "13px" }}
            >
              {attribution}
            </div>
          ) : null}
        </div>
        {showThumbnail ? (
          <div
            aria-hidden
            className="h-full min-h-[84px] rounded-[var(--radius-soft)]"
            style={{
              border: "1px solid var(--border)",
              background:
                "radial-gradient(120% 100% at 50% 40%, rgba(184,137,55,0.18), transparent 55%), linear-gradient(180deg, #1a1612, #0a0807)",
            }}
          />
        ) : null}
      </div>
    </section>
  );
}
