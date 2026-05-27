import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { BackButton, MotionPage } from "@/components";
import type { PlacesLibraryRow } from "@/lib/types/database";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return { title: `${slug.replace(/-/g, " ")} · Library` };
}

export default async function LibraryEntryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const user = await getSessionUser();
  if (!user) redirect(`/login?next=/account/library/${slug}`);

  const supabase = await getServerSupabase();
  const { data } = await supabase
    .from("places_library")
    .select("*")
    .eq("user_id", user.id)
    .eq("slug", slug)
    .maybeSingle();

  if (!data) notFound();

  const entry = data as PlacesLibraryRow;

  const sources = (entry.sources_cited as Array<{
    url: string;
    publication: string;
    snippet: string;
  }> | null) ?? [];

  const events = (entry.events_observed as Array<{
    type: string;
    day?: string;
    notes: string;
  }> | null) ?? [];

  const vibeKeywords = entry.vibe_keywords ?? [];
  const bestFor = entry.best_for ?? [];
  const notFor = entry.not_for ?? [];

  const lastResearched = entry.last_researched_at
    ? new Date(entry.last_researched_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <main
      className="lux-page smooth-page mx-auto min-h-[100dvh] w-full max-w-[680px] overflow-x-hidden px-6 text-warm-ivory"
      style={{
        paddingTop: "calc(env(safe-area-inset-top) + 32px)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 48px)",
      }}
    >
      <MotionPage>
        <header className="flex items-center justify-between">
          <BackButton fallbackHref="/account/library" />
          <span className="lux-label capitalize">{entry.place_type ?? "place"}</span>
          <span className="w-16" aria-hidden />
        </header>

        {/* Hero */}
        <section className="mt-6">
          <h1 className="font-serif text-[44px] italic leading-[1.05] tracking-[-0.005em] text-warm-ivory">
            {entry.name}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-warm-ivory/50">
            {entry.neighborhood ? <span>{entry.neighborhood}</span> : null}
            {entry.neighborhood && entry.cuisine_or_focus ? (
              <span aria-hidden>·</span>
            ) : null}
            {entry.cuisine_or_focus ? <span>{entry.cuisine_or_focus}</span> : null}
            {entry.price_level ? (
              <>
                <span aria-hidden>·</span>
                <span>{entry.price_level}</span>
              </>
            ) : null}
          </div>
        </section>

        {/* Verdict */}
        {entry.verdict ? (
          <section className="lux-surface mt-6 rounded-[var(--radius-card)] px-5 py-4">
            <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-warm-ivory/40">
              Jarvis on this
            </div>
            <p className="text-[15px] leading-[1.6] text-warm-ivory/88">
              {entry.verdict}
            </p>
            {entry.compared_to ? (
              <p className="mt-2 text-[13px] text-warm-ivory/45">
                Think: {entry.compared_to}
              </p>
            ) : null}
            <div className="mt-3 flex items-center gap-2">
              <StrengthBar value={entry.verdict_strength ?? 0} />
              <span className="text-[11px] text-warm-ivory/35">
                {Math.round((entry.verdict_strength ?? 0) * 100)}% conviction
              </span>
            </div>
          </section>
        ) : null}

        {/* Vibe keywords */}
        {vibeKeywords.length > 0 ? (
          <section className="mt-6">
            <div className="lux-label mb-3">Vibe</div>
            <div className="flex flex-wrap gap-2">
              {vibeKeywords.map((kw) => (
                <span
                  key={kw}
                  className="rounded-sm border border-white/[0.08] px-2.5 py-1 text-[11px] text-warm-ivory/60"
                >
                  {kw}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        {/* Best for / Not for */}
        {(bestFor.length > 0 || notFor.length > 0) ? (
          <section className="mt-6 grid grid-cols-2 gap-4">
            {bestFor.length > 0 ? (
              <div>
                <div className="lux-label mb-2">Best for</div>
                <ul className="flex flex-col gap-1">
                  {bestFor.map((item) => (
                    <li key={item} className="text-[13px] text-warm-ivory/65">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {notFor.length > 0 ? (
              <div>
                <div className="lux-label mb-2">Not for</div>
                <ul className="flex flex-col gap-1">
                  {notFor.map((item) => (
                    <li key={item} className="text-[13px] text-warm-ivory/45">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}

        {/* Hours */}
        {entry.hours_summary ? (
          <section className="mt-6">
            <div className="lux-label mb-2">Hours</div>
            <p className="text-[14px] text-warm-ivory/65">{entry.hours_summary}</p>
          </section>
        ) : null}

        {/* Seasonal notes */}
        {entry.seasonal_notes ? (
          <section className="mt-6">
            <div className="lux-label mb-2">Seasonal</div>
            <p className="text-[14px] text-warm-ivory/65">{entry.seasonal_notes}</p>
          </section>
        ) : null}

        {/* Events observed */}
        {events.length > 0 ? (
          <section className="mt-6">
            <div className="lux-label mb-3">Events observed</div>
            <div className="flex flex-col gap-3">
              {events.map((ev, i) => (
                <div
                  key={i}
                  className="rounded-[var(--radius-soft)] border border-white/[0.06] px-4 py-3"
                >
                  <div className="text-[12px] uppercase tracking-[0.16em] text-warm-ivory/40">
                    {ev.type}{ev.day ? ` · ${ev.day}` : ""}
                  </div>
                  <div className="mt-1 text-[13px] text-warm-ivory/65">
                    {ev.notes}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* Sources */}
        {sources.length > 0 ? (
          <section className="mt-6">
            <div className="lux-label mb-3">Sources</div>
            <div className="flex flex-col gap-3">
              {sources.map((src, i) => (
                <a
                  key={i}
                  href={src.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col gap-0.5 border-l border-muted-gold/25 pl-3 transition-colors hover:border-muted-gold/50"
                >
                  <span className="text-[11px] uppercase tracking-[0.14em] text-muted-gold/60">
                    {src.publication}
                  </span>
                  <span className="text-[13px] leading-[1.45] text-warm-ivory/55">
                    {src.snippet?.slice(0, 120)}
                    {src.snippet?.length > 120 ? "…" : ""}
                  </span>
                </a>
              ))}
            </div>
          </section>
        ) : null}

        {/* Footer metadata */}
        <footer className="mt-10 flex flex-col gap-1 border-t border-white/[0.05] pt-5 text-[12px] text-warm-ivory/30">
          {lastResearched ? (
            <span>Last researched {lastResearched}</span>
          ) : null}
          {entry.times_surfaced != null && entry.times_surfaced > 0 ? (
            <span>Surfaced {entry.times_surfaced} time{entry.times_surfaced !== 1 ? "s" : ""}</span>
          ) : null}
          {entry.user_feedback_signal ? (
            <span>Feedback: {entry.user_feedback_signal}</span>
          ) : null}
        </footer>
      </MotionPage>
    </main>
  );
}

function StrengthBar({ value }: { value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const color =
    pct >= 75
      ? "bg-[#7BC4A0]"
      : pct >= 50
        ? "bg-muted-gold"
        : "bg-warm-ivory/20";

  return (
    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/[0.06]">
      <div
        className={`h-full rounded-full transition-all ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
