import Link from "next/link";
import { AppFrame } from "@/components";
import { EmptyTab } from "@/components/empty/EmptyTab";
import { CompassVisual } from "@/components/empty/Visuals";
import { Chevron } from "@/components/icons";
import { dateLabel } from "@/lib/dateLabel";

const ROWS = [
  { label: "Long-term clarity", icon: <TriangleIcon /> },
  { label: "Values alignment", icon: <ScaleIcon /> },
  { label: "Better decisions", icon: <TargetIcon /> },
];

export function NorthEmpty() {
  return (
    <AppFrame>
      <EmptyTab
        title="North"
        titleItalic
        date={dateLabel()}
        copy={
          <>
            Your long arc. Direction, decisions,
            <br />
            and what matters most.
          </>
        }
        visual={<CompassVisual />}
        headline="The direction is forming."
        subcopy={
          <>
            Your long arc gets clearer
            <br />
            as you decide.
          </>
        }
        actions={
          <ul className="flex flex-col gap-2">
            {ROWS.map((r) => (
              <li key={r.label}>
                <Link
                  href="/login"
                  className="flex min-h-12 items-center justify-between gap-3 rounded-md border border-divider/60 px-4 py-3 text-left text-[13px] text-warm-ivory/85 transition duration-300 ease-atmospheric hover:border-divider hover:bg-soft-black/40 active:translate-y-px active:bg-soft-black/70"
                >
                  <span className="flex items-center gap-3">
                    <span className="text-muted-gold/85">{r.icon}</span>
                    {r.label}
                  </span>
                  <Chevron direction="right" size={14} className="text-warm-ivory/40" />
                </Link>
              </li>
            ))}
          </ul>
        }
      />
    </AppFrame>
  );
}

function TriangleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 4l9 16H3z" />
    </svg>
  );
}
function ScaleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 4v16M5 8h14" />
      <path d="M5 8l-2 6h4z" />
      <path d="M19 8l-2 6h4z" />
      <path d="M8 20h8" />
    </svg>
  );
}
function TargetIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}
