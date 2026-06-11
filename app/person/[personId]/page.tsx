import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppFrame } from "@/components";
import { getViewableProfileId } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import {
  contactRhythm,
  daysUntilImportantDate,
  readCircleGiftIdeas,
  readCircleImportantDates,
} from "@/lib/circle/personFields";
import { GiftResearchButton } from "./GiftResearchButton";

export const dynamic = "force-dynamic";

/**
 * Person profile — everything that hangs off a person: who they are, the
 * rhythm of the connection, their important dates, the running gift list,
 * notes, and recent history. Sections render only when real data exists.
 */
export default async function PersonPage({
  params,
}: {
  params: Promise<{ personId: string }>;
}) {
  const { personId } = await params;
  const { id: userId } = await getViewableProfileId();
  if (!userId) redirect("/login");

  const supabase = await getServerSupabase();
  const [{ data: person }, { data: updates }] = await Promise.all([
    supabase
      .from("circle_people")
      .select("*")
      .eq("id", personId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("circle_updates")
      .select("id, title, summary, suggested_action, created_at")
      .eq("user_id", userId)
      .eq("person_id", personId)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);
  if (!person) notFound();

  const row = person as Record<string, unknown>;
  const name = String(row.name ?? "");
  const role = typeof row.role === "string" ? row.role : null;
  const category = typeof row.category === "string" ? row.category : null;
  const currentThread = typeof row.current_thread === "string" ? row.current_thread : null;
  const notes = Array.isArray(row.notes) ? (row.notes as string[]) : [];
  const dates = readCircleImportantDates(row.important_dates);
  const gifts = readCircleGiftIdeas(row.gift_ideas);
  const rhythm = contactRhythm({
    lastInteraction: typeof row.last_interaction === "string" ? row.last_interaction : null,
    lastSeenAt: typeof row.last_seen_at === "string" ? row.last_seen_at : null,
    contactRhythmDays:
      typeof row.contact_rhythm_days === "number" ? row.contact_rhythm_days : null,
  });
  const history = (updates ?? []) as Array<{
    id: string;
    title: string;
    summary: string;
    suggested_action: string | null;
    created_at: string;
  }>;

  const datedRows = dates
    .map((d) => ({ ...d, daysUntil: daysUntilImportantDate(d.date) }))
    .sort((a, b) => (a.daysUntil ?? 9999) - (b.daysUntil ?? 9999));

  return (
    <AppFrame>
      <div className="pt-6">
        <Link
          href="/circle"
          className="text-[11px] uppercase tracking-[0.2em] text-warm-ivory/45 transition-colors duration-300 ease-atmospheric hover:text-warm-ivory/75"
        >
          ← Circle
        </Link>
      </div>

      <header className="mt-6 flex flex-col gap-3">
        <h1 className="font-serif text-[44px] italic leading-[1.05] tracking-[-0.005em] text-warm-ivory">
          {name}
        </h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] uppercase tracking-[0.2em]">
          {role ? <span className="text-muted-gold/85">{role}</span> : null}
          {category ? <span className="text-warm-ivory/40">{category.replace(/_/g, " ")}</span> : null}
        </div>
        {rhythm.line ? (
          <p className="flex items-center gap-2 text-[13px] leading-[1.5] text-warm-ivory/62">
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background:
                  rhythm.state === "warm"
                    ? "var(--gold)"
                    : rhythm.state === "drifting"
                      ? "rgba(208,173,104,0.45)"
                      : "rgba(221,211,194,0.25)",
              }}
            />
            {rhythm.line}
            {rhythm.state === "drifting" ? " Drifting." : rhythm.state === "cold" ? " It's been a while." : ""}
          </p>
        ) : null}
        {currentThread ? (
          <p className="max-w-[44ch] text-[14px] leading-[1.55] text-warm-ivory/55">
            {currentThread}
          </p>
        ) : null}
        <div className="h-px w-8 bg-muted-gold/30" />
      </header>

      {datedRows.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-[10px] uppercase tracking-[0.2em] text-warm-ivory/45">
            Important dates
          </h2>
          <div className="lux-surface mt-3 divide-y divide-white/[0.05] rounded-[var(--radius-card)]">
            {datedRows.map((d, i) => (
              <div key={`${d.label}-${i}`} className="flex items-baseline justify-between px-4 py-3.5">
                <div>
                  <div className="font-serif text-[17px] leading-tight text-warm-ivory">
                    {d.label}
                  </div>
                  <div className="mt-0.5 text-[11px] uppercase tracking-[0.16em] text-warm-ivory/40">
                    {d.date}
                  </div>
                </div>
                {typeof d.daysUntil === "number" ? (
                  <span className="text-[10px] uppercase tracking-[0.18em] text-muted-gold">
                    {d.daysUntil === 0 ? "Today" : d.daysUntil === 1 ? "Tomorrow" : `In ${d.daysUntil} days`}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-8">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[10px] uppercase tracking-[0.2em] text-warm-ivory/45">
            Gift list
          </h2>
          <GiftResearchButton personId={personId} personName={name} />
        </div>
        {gifts.length > 0 ? (
          <div className="lux-surface mt-3 divide-y divide-white/[0.05] rounded-[var(--radius-card)]">
            {gifts.map((g, i) => (
              <div key={`${g.idea}-${i}`} className="px-4 py-3.5">
                <div className="text-[14px] leading-[1.5] text-warm-ivory/80">{g.idea}</div>
                {g.note ? (
                  <div className="mt-0.5 text-[12px] text-warm-ivory/45">{g.note}</div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-[13px] leading-[1.5] text-warm-ivory/45">
            Nothing on the list yet. Mention an idea and it lands here.
          </p>
        )}
      </section>

      {notes.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-[10px] uppercase tracking-[0.2em] text-warm-ivory/45">Notes</h2>
          <div className="lux-surface mt-3 divide-y divide-white/[0.05] rounded-[var(--radius-card)]">
            {notes.slice(-12).reverse().map((note, i) => (
              <div key={i} className="px-4 py-3 text-[13px] leading-[1.5] text-warm-ivory/68">
                {note}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {history.length > 0 ? (
        <section className="mt-8 pb-6">
          <h2 className="text-[10px] uppercase tracking-[0.2em] text-warm-ivory/45">History</h2>
          <div className="lux-surface mt-3 divide-y divide-white/[0.05] rounded-[var(--radius-card)]">
            {history.map((u) => (
              <div key={u.id} className="px-4 py-3.5">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="font-serif text-[16px] leading-tight text-warm-ivory">
                    {u.title}
                  </div>
                  <span className="shrink-0 text-[10px] uppercase tracking-[0.16em] text-warm-ivory/35">
                    {new Date(u.created_at)
                      .toLocaleDateString("en-US", { month: "short", day: "numeric" })
                      .toUpperCase()}
                  </span>
                </div>
                <p className="mt-1 text-[13px] leading-[1.45] text-warm-ivory/60">{u.summary}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </AppFrame>
  );
}
