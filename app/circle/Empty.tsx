import Link from "next/link";
import { AppFrame, BottomNav } from "@/components";
import { EmptyTab } from "@/components/empty/EmptyTab";
import { OrbitVisual } from "@/components/empty/Visuals";
import { Chevron } from "@/components/icons";
import { dateLabel } from "@/lib/dateLabel";

const ROWS = [
  { label: "Remember who matters", icon: <UsersIcon /> },
  { label: "Strengthen key relationships", icon: <HeartIcon /> },
  { label: "Build new ones intentionally", icon: <UserPlusIcon /> },
];

export function CircleEmpty() {
  return (
    <AppFrame>
      <EmptyTab
        title="Circle"
        titleItalic
        date={dateLabel()}
        copy={
          <>
            Your inner circle. Key relationships
            <br />
            and recent context.
          </>
        }
        visual={<OrbitVisual />}
        headline="Your circle will take shape."
        subcopy={
          <>
            Add people through notes, plans,
            <br />
            and conversations.
          </>
        }
        actions={
          <ul className="flex flex-col gap-2">
            {ROWS.map((r) => (
              <li key={r.label}>
                <Link
                  href="/login"
                  className="flex items-center justify-between gap-3 rounded-md border border-divider/60 px-4 py-3 text-left text-[13px] text-warm-ivory/85 transition-colors duration-300 ease-atmospheric hover:border-divider hover:bg-soft-black/40"
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
      <BottomNav active="Circle" />
    </AppFrame>
  );
}

function UsersIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <path d="M14 20a5 5 0 0 1 7 0" />
    </svg>
  );
}
function HeartIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" />
    </svg>
  );
}
function UserPlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <path d="M18 8v6M15 11h6" />
    </svg>
  );
}
