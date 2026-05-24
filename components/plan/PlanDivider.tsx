/**
 * PlanDivider — thin gold-tinted divider used inside sections.
 * Two widths:
 *  - "full" stretches edge to edge (page width)
 *  - "inset" sits inside section padding
 */
export function PlanDivider({
  variant = "inset",
  className = "",
}: {
  variant?: "full" | "inset";
  className?: string;
}) {
  const baseClass = variant === "full" ? "" : "mx-5";
  return (
    <div
      className={`h-px ${baseClass} ${className}`.trim()}
      style={{
        background:
          "linear-gradient(90deg, transparent, rgba(246,239,221,0.10), transparent)",
      }}
    />
  );
}
