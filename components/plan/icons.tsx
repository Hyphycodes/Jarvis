import type { SVGProps } from "react";

/**
 * Plan-system icons. Strokes only, 1.5 weight, gold by default.
 *
 * Keep this set tight — the design language calls for a small, refined
 * iconography vocabulary. Add an entry here before using a new icon
 * anywhere in `components/plan/*`.
 */

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base(props: IconProps) {
  const { size = 22, stroke = "var(--gold)", ...rest } = props;
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke,
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    ...rest,
  };
}

export function ClockIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function WeatherIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M7 18a4 4 0 010-8 5 5 0 019.6-1A3 3 0 1117 18H7z" />
    </svg>
  );
}

export function ParkingIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M10 8h3a2.5 2.5 0 010 5h-3v3" />
    </svg>
  );
}

export function PersonIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4 21c0-3.5 3.5-6 8-6s8 2.5 8 6" />
    </svg>
  );
}

export function JacketIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M7 4l5 3 5-3 3 3-3 3v10H4V10L1 7l3-3z" />
      <path d="M12 7v14" />
    </svg>
  );
}

export function WineIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M7 3h10l-1 7a4 4 0 01-8 0L7 3z" />
      <path d="M12 14v7" />
      <path d="M8 21h8" />
    </svg>
  );
}

export function RecordIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="12" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function MapPinIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 22s7-7.5 7-12a7 7 0 10-14 0c0 4.5 7 12 7 12z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

export function SignpostIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3v18" />
      <path d="M5 6h12l3 3-3 3H5z" />
      <path d="M7 14h11l3 3-3 3H7z" />
    </svg>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M20 14.5A8 8 0 119.5 4 6.5 6.5 0 0020 14.5z" />
    </svg>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function ShareIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3v14" />
      <path d="M7 8l5-5 5 5" />
      <path d="M4 17v3a1 1 0 001 1h14a1 1 0 001-1v-3" />
    </svg>
  );
}

export function MoreIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="6" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="18" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Resolver — pick icon by string key from PlanBrief
export type PlanIconKey =
  | "clock"
  | "weather"
  | "parking"
  | "person"
  | "jacket"
  | "wine"
  | "record"
  | "map-pin"
  | "signpost"
  | "moon"
  | "arrow-right"
  | "chevron-right";

export function PlanIcon({
  name,
  size,
  stroke,
}: {
  name: PlanIconKey;
  size?: number;
  stroke?: string;
}) {
  const props: IconProps = { size, stroke };
  switch (name) {
    case "clock":
      return <ClockIcon {...props} />;
    case "weather":
      return <WeatherIcon {...props} />;
    case "parking":
      return <ParkingIcon {...props} />;
    case "person":
      return <PersonIcon {...props} />;
    case "jacket":
      return <JacketIcon {...props} />;
    case "wine":
      return <WineIcon {...props} />;
    case "record":
      return <RecordIcon {...props} />;
    case "map-pin":
      return <MapPinIcon {...props} />;
    case "signpost":
      return <SignpostIcon {...props} />;
    case "moon":
      return <MoonIcon {...props} />;
    case "arrow-right":
      return <ArrowRightIcon {...props} />;
    case "chevron-right":
      return <ChevronRightIcon {...props} />;
  }
}
