import { PlanMetaLine } from "./PlanMetaLine";

/**
 * PlanSectionHeader — header used at the top of chapter sub-pages.
 *
 * Gold uppercase eyebrow (rendered by PlanTopBar already, so this skips
 * it), large italic serif title, italic subtitle, then a small-caps
 * meta line. Mirrors the "Ready the night." and "The flow of the night."
 * layouts in the OG references.
 */
export function PlanSectionHeader({
  title,
  subtitle,
  meta,
}: {
  title: string;
  subtitle?: string;
  meta?: Array<string | null | undefined>;
}) {
  return (
    <header className="px-5 pt-6">
      <h1
        className="font-serif italic"
        style={{
          color: "var(--text-primary)",
          fontSize: "44px",
          lineHeight: 1.04,
          letterSpacing: "-0.005em",
        }}
      >
        {title}
      </h1>
      {subtitle ? (
        <p
          className="mt-4 max-w-[36ch] font-serif italic"
          style={{
            color: "var(--text-muted)",
            fontSize: "17px",
            lineHeight: 1.5,
          }}
        >
          {subtitle}
        </p>
      ) : null}
      {meta && meta.some(Boolean) ? (
        <div className="mt-5">
          <PlanMetaLine parts={meta} tone="muted" />
        </div>
      ) : null}
    </header>
  );
}
