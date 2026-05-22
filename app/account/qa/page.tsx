import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { isQaToolsEnabled } from "@/lib/qa/gate";
import { BackButton, MotionPage } from "@/components";
import {
  clearQaFixtures,
  createQaActivePlanFixture,
  createQaRadarItem,
  createQaTodayItem,
  createQaUpcomingItem,
} from "./actions";

export const metadata = { title: "QA Fixtures · Jarvis" };
export const dynamic = "force-dynamic";

type QaCounts = {
  surfacedItems: number;
  plans: number;
  timelineItems: number;
};

export default async function QaFixturesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/account/qa");
  if (user.role !== "owner" || !isQaToolsEnabled()) notFound();

  const counts = await loadQaCounts(user.id);

  return (
    <main
      className="smooth-page mx-auto min-h-[100dvh] w-full max-w-[680px] overflow-x-hidden bg-near-black px-6 text-warm-ivory"
      style={{
        paddingTop: "calc(env(safe-area-inset-top) + 32px)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 36px)",
      }}
    >
      <MotionPage>
        <header className="flex items-baseline justify-between">
          <BackButton fallbackHref="/account" />
          <Link
            href="/account"
            className="text-[16px] font-medium text-warm-ivory transition-colors duration-300 ease-atmospheric hover:text-warm-ivory/80"
          >
            Done
          </Link>
        </header>

        <section className="mt-6">
          <span className="text-[11px] uppercase tracking-editorial text-muted-gold">
            Owner only
          </span>
          <h1 className="mt-2 font-serif text-[52px] italic leading-[1.0] tracking-[-0.01em] text-warm-ivory">
            QA Fixtures
          </h1>
          <p className="mt-4 max-w-[42ch] text-[14px] leading-[1.6] text-warm-ivory/62">
            Creates and deletes owner-only test records for real Radar, Today,
            Upcoming, and generated-plan smoke testing. Every row is prefixed
            with [QA] and marked with payload.qa_fixture.
          </p>
        </section>

        <section className="mt-8 grid grid-cols-3 gap-3">
          <CountTile label="Items" value={counts.surfacedItems} />
          <CountTile label="Plans" value={counts.plans} />
          <CountTile label="Timeline" value={counts.timelineItems} />
        </section>

        <section className="mt-8 rounded-2xl border border-white/[0.06] bg-white/[0.012] px-5 py-5">
          <h2 className="text-[11px] uppercase tracking-editorial text-muted-gold">
            Create fixtures
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <QaActionForm action={createQaRadarItem} label="Create Radar briefs" />
            <QaActionForm action={createQaTodayItem} label="Create Today item" />
            <QaActionForm
              action={createQaUpcomingItem}
              label="Create Upcoming item"
            />
            <QaActionForm
              action={createQaActivePlanFixture}
              label="Create Active Plan fixture"
            />
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-[#E07A6E]/25 bg-[#E07A6E]/[0.03] px-5 py-5">
          <h2 className="text-[11px] uppercase tracking-editorial text-[#E07A6E]">
            Cleanup
          </h2>
          <p className="mt-2 text-[13px] leading-[1.55] text-warm-ivory/55">
            Removes only current-owner rows that are QA fixtures: [QA] surfaced
            items, [QA] plans, and child sections/timeline rows for those plans.
          </p>
          <form action={clearQaFixtures} className="mt-4">
            <button
              type="submit"
              className="rounded-full border border-[#E07A6E]/45 bg-[#E07A6E]/5 px-5 py-2.5 text-[11px] uppercase tracking-editorial text-[#E07A6E] transition-colors duration-300 ease-atmospheric hover:bg-[#E07A6E]/10"
            >
              Clear QA fixtures
            </button>
          </form>
        </section>

        <section className="mt-8 text-[12px] leading-[1.6] text-warm-ivory/42">
          Enabled in development, or in deployed environments only when
          ENABLE_QA_TOOLS=true is set. Logged-out users and non-owner accounts
          cannot access this page or run its actions.
        </section>
      </MotionPage>
    </main>
  );
}

function QaActionForm({
  action,
  label,
}: {
  action: () => Promise<void>;
  label: string;
}) {
  return (
    <form action={action}>
      <button
        type="submit"
        className="w-full rounded-full border border-muted-gold/40 bg-muted-gold/5 px-5 py-2.5 text-[11px] uppercase tracking-editorial text-muted-gold transition-colors duration-300 ease-atmospheric hover:bg-muted-gold/10"
      >
        {label}
      </button>
    </form>
  );
}

function CountTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.012] px-4 py-3">
      <div className="text-[10px] uppercase tracking-editorial text-warm-ivory/38">
        {label}
      </div>
      <div className="mt-1 font-serif text-[24px] leading-tight text-warm-ivory">
        {value}
      </div>
    </div>
  );
}

async function loadQaCounts(userId: string): Promise<QaCounts> {
  try {
    const supabase = await getServerSupabase();
    const [itemsRes, plansRes, timelineRes] = await Promise.all([
      supabase
        .from("surfaced_items")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .ilike("title", "[QA]%"),
      supabase
        .from("plans")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .ilike("title", "[QA]%"),
      supabase
        .from("today_timeline_items")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .ilike("title", "[QA]%"),
    ]);

    return {
      surfacedItems: itemsRes.count ?? 0,
      plans: plansRes.count ?? 0,
      timelineItems: timelineRes.count ?? 0,
    };
  } catch (error) {
    console.error("[qa] counts", error);
    return { surfacedItems: 0, plans: 0, timelineItems: 0 };
  }
}
