/**
 * PlanImageCard — atmospheric image placeholder used on chapter pages
 * (Before You Go uses a right-column image; Atmosphere/etc. may use it
 * for decorative pacing). Renders an image when provided, otherwise a
 * subtle radial-gradient with thin border.
 */
export function PlanImageCard({
  src,
  alt,
  aspect = "portrait",
  className = "",
}: {
  src?: string;
  alt?: string;
  aspect?: "portrait" | "square" | "landscape";
  className?: string;
}) {
  const aspectClass =
    aspect === "portrait"
      ? "aspect-[3/4]"
      : aspect === "square"
        ? "aspect-square"
        : "aspect-[16/9]";

  if (src) {
    return (
      <div
        className={`overflow-hidden rounded-[var(--radius-soft)] ${aspectClass} ${className}`.trim()}
        style={{ border: "1px solid var(--border)" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt ?? ""}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div
      aria-hidden
      className={`overflow-hidden rounded-[var(--radius-soft)] ${aspectClass} ${className}`.trim()}
      style={{
        border: "1px solid var(--border)",
        background:
          "radial-gradient(110% 80% at 40% 30%, rgba(184,137,55,0.12), transparent 60%), linear-gradient(180deg, #1a1612, #0a0807)",
      }}
    />
  );
}
