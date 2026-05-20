"use client";

type Props = {
  onPress?: () => void;
  label?: string;
};

export function FloatingMicButton({ onPress, label = "Voice" }: Props) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 mx-auto flex w-full max-w-[440px] justify-end px-6"
      style={{ paddingBottom: "calc(var(--safe-bottom) + 12px)" }}
    >
      <button
        type="button"
        aria-label={label}
        onClick={onPress}
        className="pointer-events-auto group flex h-12 w-12 items-center justify-center rounded-full border border-muted-gold/60 bg-near-black/70 backdrop-blur transition-all duration-500 ease-atmospheric hover:border-soft-gold hover:bg-charcoal/80"
      >
        <MicGlyph />
      </button>
    </div>
  );
}

function MicGlyph() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-soft-gold transition-colors duration-500 ease-atmospheric group-hover:text-warm-ivory"
    >
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
    </svg>
  );
}
