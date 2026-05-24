import type { ReactNode } from "react";
import { PlanMetaLine } from "./PlanMetaLine";
import type { PlanCategory } from "@/lib/plans/planBrief";

/**
 * PlanHero — cinematic top of the main plan page.
 *
 * Full-bleed background (image when provided, otherwise an atmospheric
 * radial-gradient fallback), gradient overlay for legibility, category
 * eyebrow, large italic-light serif title, meta line, summary, and a
 * primary CTA slot below.
 *
 * Designed to fit comfortably below the PlanTopBar without competing with
 * it — the top bar is transparent and floats above the gradient.
 */
export function PlanHero({
  image,
  categoryLabel,
  title,
  meta,
  summary,
  primary,
}: {
  image?: string;
  categoryLabel: string;
  title: string;
  meta: Array<string | null | undefined>;
  summary: string;
  primary?: ReactNode;
}) {
  return (
    <section className="relative -mt-[68px]">
      {/* Background image / gradient */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-[400px] overflow-hidden sm:h-[420px]"
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            className="h-full w-full object-cover"
            loading="eager"
          />
        ) : (
          <div
            className="h-full w-full"
            style={{ backgroundImage: heroFallbackGradient() }}
          />
        )}
        {/* Bottom gradient to fade the image into the page bg */}
        <div
          className="absolute inset-x-0 bottom-0 h-[260px]"
          style={{
            background:
              "linear-gradient(180deg, rgba(6,6,5,0) 0%, rgba(6,6,5,0.55) 45%, var(--bg) 100%)",
          }}
        />
        {/* Top scrim so the topbar stays legible */}
        <div
          className="absolute inset-x-0 top-0 h-[120px]"
          style={{
            background:
              "linear-gradient(180deg, rgba(6,6,5,0.55) 0%, rgba(6,6,5,0) 100%)",
          }}
        />
      </div>

      {/* Content */}
      <div className="relative px-5 pb-6" style={{ paddingTop: "clamp(210px, 55vw, 240px)" }}>
        <div
          className="font-mono text-[11px] uppercase tracking-[0.2em]"
          style={{ color: "var(--text-muted)" }}
        >
          {categoryLabel}
        </div>
        <h1
          className="mt-3 font-serif italic"
          style={{
            color: "var(--text-primary)",
            fontSize: "clamp(48px, 13vw, 56px)",
            lineHeight: 1.02,
            letterSpacing: "-0.005em",
          }}
        >
          {title}
        </h1>
        <div className="mt-4">
          <PlanMetaLine parts={meta} />
        </div>
        <p
          className="mt-3 max-w-[36ch] text-[15px] leading-[1.5]"
          style={{ color: "var(--text-muted)" }}
        >
          {summary}
        </p>
        {primary ? <div className="mt-6">{primary}</div> : null}
      </div>
    </section>
  );
}

function heroFallbackGradient(): string {
  return [
    "radial-gradient(120% 80% at 70% 20%, rgba(184,137,55,0.18), transparent 55%)",
    "radial-gradient(80% 60% at 30% 80%, rgba(208,173,104,0.10), transparent 60%)",
    "linear-gradient(180deg, #1a1612 0%, #0d0a07 60%, var(--bg) 100%)",
  ].join(", ");
}

// Exported so the page can pre-compute an image URL strategy by category
export function heroImageForCategory(_category: PlanCategory): string | undefined {
  // We don't ship cinematic stock photos in this sprint — every plan
  // uses the atmospheric gradient fallback unless the source item
  // provides a heroImage. Sample/sparrow can override.
  return undefined;
}
