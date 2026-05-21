type IconProps = { size?: number; className?: string };

const S = "currentColor";

function svgProps(size: number) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: S,
    strokeWidth: 1.25,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
}

export function Chevron({
  size = 16,
  className = "",
  direction = "down",
}: IconProps & { direction?: "up" | "down" | "right" | "left" }) {
  const rotate =
    direction === "up"
      ? "rotate-180"
      : direction === "right"
        ? "-rotate-90"
        : direction === "left"
          ? "rotate-90"
          : "";
  return (
    <svg {...svgProps(size)} className={`${rotate} ${className}`}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function Arrow({ size = 14, className = "" }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <path d="M7 17L17 7" />
      <path d="M9 7h8v8" />
    </svg>
  );
}

export function ArrowRight({ size = 16, className = "" }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  );
}

export function ArrowLeft({ size = 16, className = "" }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <path d="M19 12H5" />
      <path d="M11 6l-6 6 6 6" />
    </svg>
  );
}

export function Mic({ size = 18, className = "" }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
    </svg>
  );
}

export function Bell({ size = 16, className = "" }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}

export function Car({ size = 16, className = "" }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <path d="M3 13l2-6h14l2 6" />
      <rect x="3" y="13" width="18" height="5" rx="1" />
      <circle cx="7" cy="18" r="1.25" fill={S} />
      <circle cx="17" cy="18" r="1.25" fill={S} />
    </svg>
  );
}

export function Cloud({ size = 16, className = "" }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <path d="M7 18a4 4 0 0 1-.5-7.96A6 6 0 0 1 18 11a3.5 3.5 0 0 1-.5 7H7z" />
      <path d="M9 20l-1 2" />
      <path d="M13 20l-1 2" />
    </svg>
  );
}

export function User({ size = 16, className = "" }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  );
}

export function Clock({ size = 16, className = "" }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function MapPin({ size = 16, className = "" }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <path d="M12 21s-7-7-7-12a7 7 0 0 1 14 0c0 5-7 12-7 12z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

export function Fork({ size = 16, className = "" }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <path d="M8 3v6a2 2 0 0 0 4 0V3" />
      <path d="M10 11v10" />
      <path d="M16 3c2 0 2 4 2 6s-1 3-2 3v9" />
    </svg>
  );
}

export function Ticket({ size = 16, className = "" }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <rect x="3" y="7" width="18" height="10" rx="2" />
      <path d="M9 7v10" strokeDasharray="1.5 2" />
    </svg>
  );
}

export function Sparkle({ size = 16, className = "" }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <path d="M12 4l1.5 4.5L18 10l-4.5 1.5L12 16l-1.5-4.5L6 10l4.5-1.5z" />
      <path d="M5 4l.7 2L8 6.7 5.7 7.5 5 9.5l-.7-2L2 6.7 4.3 6z" opacity=".5" />
    </svg>
  );
}

export function Ellipsis({ size = 16, className = "" }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <circle cx="6" cy="12" r="1" fill={S} />
      <circle cx="12" cy="12" r="1" fill={S} />
      <circle cx="18" cy="12" r="1" fill={S} />
    </svg>
  );
}

export function Share({ size = 16, className = "" }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <path d="M12 4v12" />
      <path d="M8 8l4-4 4 4" />
      <path d="M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
    </svg>
  );
}

export function Jacket({ size = 16, className = "" }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <path d="M6 4l6 3 6-3v16H6z" />
      <path d="M12 7v13" />
    </svg>
  );
}

export function WineGlass({ size = 16, className = "" }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <path d="M7 3h10c0 5-2 8-5 8s-5-3-5-8z" />
      <path d="M12 11v8" />
      <path d="M8 21h8" />
    </svg>
  );
}

export function Record({ size = 16, className = "" }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2" fill={S} />
    </svg>
  );
}

export function SignPost({ size = 16, className = "" }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <path d="M12 3v18" />
      <path d="M4 7h12l2 2-2 2H4z" />
      <path d="M20 13H8l-2 2 2 2h12z" />
    </svg>
  );
}

export function Moon({ size = 16, className = "" }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <path d="M20 14A8 8 0 1 1 10 4a7 7 0 0 0 10 10z" />
    </svg>
  );
}

export function Receipt({ size = 16, className = "" }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <path d="M5 3h14v18l-3-2-3 2-3-2-3 2-2-2z" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  );
}

export function Link2({ size = 16, className = "" }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" />
      <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" />
    </svg>
  );
}

export function Gear({ size = 16, className = "" }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export function Brain({ size = 16, className = "" }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <path d="M9.5 2a2.5 2.5 0 0 0-2.5 2.5v.05A2.5 2.5 0 0 0 4.5 7a2.5 2.5 0 0 0 .5 1.5A2.5 2.5 0 0 0 4 11a2.5 2.5 0 0 0 1 2 2.5 2.5 0 0 0-1 2 2.5 2.5 0 0 0 2.5 2.5A2.5 2.5 0 0 0 9 20a2.5 2.5 0 0 0 3-.5V4.5A2.5 2.5 0 0 0 9.5 2z" />
      <path d="M14.5 2a2.5 2.5 0 0 1 2.5 2.5v.05A2.5 2.5 0 0 1 19.5 7a2.5 2.5 0 0 1-.5 1.5A2.5 2.5 0 0 1 20 11a2.5 2.5 0 0 1-1 2 2.5 2.5 0 0 1 1 2 2.5 2.5 0 0 1-2.5 2.5A2.5 2.5 0 0 1 15 20a2.5 2.5 0 0 1-3-.5V4.5A2.5 2.5 0 0 1 14.5 2z" />
    </svg>
  );
}

export function LogOut({ size = 16, className = "" }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

export function ShieldCheck({ size = 16, className = "" }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <path d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6l8-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

export function Lock({ size = 16, className = "" }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
