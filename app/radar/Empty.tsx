import Link from "next/link";
import { AppFrame, BottomNav } from "@/components";
import { EmptyTab } from "@/components/empty/EmptyTab";
import { RadarVisual } from "@/components/empty/Visuals";
import { dateLabel } from "@/lib/dateLabel";

const CHIPS = ["Dining", "Culture", "Places", "Events"] as const;

export function RadarEmpty() {
  return (
    <AppFrame>
      <EmptyTab
        title="Radar"
        titleItalic
        date={dateLabel()}
        copy={
          <>
            Curated signal for your taste and trajectory.
            <br />
            Not everything. Just what&rsquo;s worth your time.
          </>
        }
        visual={<RadarVisual />}
        headline="Nothing worth forcing."
        subcopy={
          <>
            I&rsquo;m watching for signals.
            <br />
            Better empty than noisy.
          </>
        }
        actions={
          <ul className="flex flex-wrap justify-center gap-2">
            {CHIPS.map((c) => (
              <li key={c}>
                <Link
                  href="/login"
                  className="inline-flex items-center rounded-full border border-divider px-4 py-1.5 text-[11px] uppercase tracking-editorial text-warm-ivory/75 transition-colors duration-300 ease-atmospheric hover:border-warm-ivory/40 hover:text-warm-ivory"
                >
                  {c}
                </Link>
              </li>
            ))}
          </ul>
        }
      />
      <BottomNav active="Radar" />
    </AppFrame>
  );
}
