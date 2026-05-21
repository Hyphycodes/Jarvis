import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { Chevron } from "@/components/icons";

export const metadata = { title: "Integrations · Jarvis" };
export const dynamic = "force-dynamic";

const CATEGORIES = [
  {
    title: "Maps & Movement",
    copy: "Location, travel time, routes, and arrival context before Jarvis suggests the move.",
  },
  {
    title: "Context Feeds",
    copy: "Weather, calendar, local changes, and lightweight signals that shape the day.",
  },
  {
    title: "Culture & Events",
    copy: "Selective restaurants, venues, shows, screenings, and rooms worth knowing about.",
  },
  {
    title: "Radar",
    copy: "The outside signal layer that filters opportunities through your taste.",
  },
  {
    title: "AI Usage",
    copy: "Model access, refresh cadence, spend limits, and saver behavior.",
  },
] as const;

export default async function IntegrationsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/settings/integrations");

  return (
    <main
      className="smooth-page mx-auto min-h-[100dvh] w-full max-w-[520px] overflow-x-hidden bg-near-black px-6 text-warm-ivory"
      style={{
        paddingTop: "calc(env(safe-area-inset-top) + 28px)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 72px)",
      }}
    >
      <Link
        href="/settings"
        className="inline-flex min-h-10 items-center gap-2 text-[11px] uppercase tracking-editorial text-warm-ivory/50 transition duration-300 ease-atmospheric hover:text-warm-ivory active:translate-y-px"
      >
        <Chevron direction="left" size={13} />
        Settings
      </Link>

      <header className="mt-4">
        <div className="text-[11px] uppercase tracking-editorial text-muted-gold">
          Integrations
        </div>
        <h1 className="mt-2 font-serif text-[42px] italic leading-[1.02] text-warm-ivory">
          What Jarvis can touch.
        </h1>
        <p className="mt-3 max-w-[39ch] font-serif text-[16px] italic leading-[1.45] text-warm-ivory/65">
          Control outside signals, refresh schedules, and spend before the
          system connects to live APIs.
        </p>
        <div className="mt-5 h-px w-10 bg-muted-gold/50" />
      </header>

      <section className="motion-card mt-10 grid gap-3">
        {CATEGORIES.map((category) => (
          <article
            key={category.title}
            className="rounded-md border border-divider/55 bg-soft-black/25 px-4 py-4"
          >
            <div className="flex items-start justify-between gap-5">
              <div>
                <h2 className="font-serif text-[21px] italic leading-tight text-warm-ivory">
                  {category.title}
                </h2>
                <p className="mt-2 max-w-[38ch] text-[13px] leading-[1.55] text-warm-ivory/58">
                  {category.copy}
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-divider px-3 py-1 text-[9px] uppercase tracking-editorial text-warm-ivory/42">
                Not connected yet.
              </span>
            </div>
          </article>
        ))}
      </section>

      <aside className="motion-card mt-8 border-l border-muted-gold/45 bg-muted-gold/[0.04] px-4 py-4">
        <p className="font-serif text-[15px] italic leading-[1.55] text-warm-ivory/72">
          Next sprint: toggles, usage limits, schedules, and emergency saver
          mode.
        </p>
      </aside>
    </main>
  );
}
