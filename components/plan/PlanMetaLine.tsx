/**
 * PlanMetaLine — small-caps line with mid-dot separators.
 * Used in the hero (LOCATION · TIME) and in chapter section headers
 * (PLAN TITLE · DATE · TIME).
 */
export function PlanMetaLine({
  parts,
  tone = "muted",
}: {
  parts: Array<string | null | undefined>;
  /** "muted" for hero, "gold" for chapter section headers. */
  tone?: "muted" | "gold";
}) {
  const cleaned = parts
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter((p): p is string => p.length > 0);
  if (cleaned.length === 0) return null;
  return (
    <div
      className="font-mono text-[11px] uppercase tracking-[0.18em]"
      style={{
        color: tone === "gold" ? "var(--gold-soft)" : "var(--text-muted)",
      }}
    >
      {cleaned.join("  ·  ")}
    </div>
  );
}
