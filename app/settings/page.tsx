import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { signOut } from "@/lib/actions/auth";
import {
  DEFAULT_WEEKLY_RHYTHM,
  normalizeWeeklyRhythm,
} from "@/lib/schedule/weeklyRhythm";
import { Chevron } from "@/components/icons";
import { BackButton, MotionPage } from "@/components";
import { WeeklyRhythmForm } from "./client-bits";

export const metadata = { title: "Settings · Jarvis" };
export const dynamic = "force-dynamic";

/**
 * Settings — intentionally minimal.
 *
 * The brain manages memory, integrations, context feeds, source connections,
 * weather, and Radar intelligence in the background automatically; none of
 * that belongs in user-facing Settings unless an explicit action is needed.
 *
 * Visible:
 *   1. Profile          (identity)
 *   2. Weekly Rhythm    (owner only — real user-editable schedule)
 *   3. Tastemakers      (manage page)
 *   4. Places           (manage page)
 *   5. Sign out
 *
 * Removed from the visible list (data + processes preserved, just not shown):
 *   - Connections / Integrations / "Queued" cards
 *   - Data & Memory / Memory proposals
 *   - Control Room / QA / intelligence diagnostics
 *   - Account status field rows ("Role / Session / Active")
 *
 * /settings/integrations remains reachable by direct URL for owner/debug
 * but is intentionally not linked here.
 */
export default async function SettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/settings");

  const owner = user.role === "owner";
  const status = await loadAccountStatus(user.id);

  return (
    <main
      className="lux-page smooth-page mx-auto min-h-[100dvh] w-full max-w-[520px] overflow-x-hidden px-6 text-warm-ivory"
      style={{
        paddingTop: "calc(env(safe-area-inset-top) + 28px)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 72px)",
      }}
    >
      <MotionPage>
        <header>
          <div className="flex items-center gap-1">
            <BackButton fallbackHref="/account" />
            <span className="lux-label">Settings</span>
          </div>
          <h1 className="mt-6 font-serif text-[42px] italic leading-[1.02] text-warm-ivory">
            Settings.
          </h1>
          <p className="mt-3 max-w-[38ch] font-serif text-[16px] italic leading-[1.45] text-warm-ivory/65">
            A few things you can adjust. Everything else runs quietly in the
            background.
          </p>
          <div className="mt-5 h-px w-10 bg-muted-gold/50" />
        </header>

        {/* 1. Profile — single link to the simplified profile page. */}
        <SettingsList>
          <SettingsRow
            href="/profile"
            label="Profile"
            hint={user.email ?? undefined}
          />

          {/* 2. Weekly Rhythm — owner only, real user-editable schedule. */}
          {owner ? (
            <SettingsExpander label="Weekly Rhythm" hint="Workdays, commute">
              <WeeklyRhythmForm
                rhythm={status.weeklyRhythm}
                lastSavedAt={status.weeklyRhythmSavedAt}
              />
            </SettingsExpander>
          ) : null}

          {/* 3. Tastemakers — manage real user-editable source list. */}
          <SettingsRow href="/account/tastemakers" label="Tastemakers" />

          {/* 4. Places — manage saved places. */}
          <SettingsRow href="/account/library" label="Places" />

          {/* 5. Closet — wardrobe Jarvis built from your photos. */}
          <SettingsRow href="/wardrobe" label="Closet" />
        </SettingsList>

        <section className="mt-14 border-t border-divider/60 pt-8">
          <p className="max-w-[34ch] text-[12px] leading-[1.55] text-warm-ivory/45">
            Sign out only when this device should stop carrying your private
            session.
          </p>
          <form action={signOut} className="mt-5">
            <button
              type="submit"
              className="min-h-11 border border-divider px-5 text-[11px] uppercase tracking-editorial text-warm-ivory/55 transition duration-300 ease-atmospheric hover:border-muted-gold/45 hover:text-muted-gold active:translate-y-px"
            >
              Sign out
            </button>
          </form>
        </section>
      </MotionPage>
    </main>
  );
}

async function loadAccountStatus(userId: string) {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("founder_profile")
    .select("weekly_rhythm, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  // Older schema may not carry weekly_rhythm yet — fall back gracefully.
  if (error && /weekly_rhythm|schema cache|column/i.test(error.message)) {
    return {
      weeklyRhythm: normalizeWeeklyRhythm(DEFAULT_WEEKLY_RHYTHM),
      weeklyRhythmSavedAt: null,
    };
  }

  return {
    weeklyRhythm: normalizeWeeklyRhythm(
      data?.weekly_rhythm ?? DEFAULT_WEEKLY_RHYTHM,
    ),
    weeklyRhythmSavedAt:
      typeof data?.updated_at === "string" ? data.updated_at : null,
  };
}

function SettingsList({ children }: { children: ReactNode }) {
  return <ul className="mt-10 flex flex-col">{children}</ul>;
}

function SettingsRow({
  href,
  label,
  hint,
}: {
  href: string;
  label: string;
  hint?: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center justify-between gap-4 border-b border-divider/40 py-4 text-warm-ivory/85 transition-colors duration-300 ease-atmospheric hover:text-warm-ivory"
      >
        <div className="flex flex-col">
          <span className="text-[15px]">{label}</span>
          {hint ? (
            <span className="mt-0.5 text-[11px] text-warm-ivory/40">{hint}</span>
          ) : null}
        </div>
        <Chevron direction="right" size={14} className="text-warm-ivory/35" />
      </Link>
    </li>
  );
}

function SettingsExpander({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <li className="border-b border-divider/40">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-warm-ivory/85 transition-colors duration-300 ease-atmospheric hover:text-warm-ivory">
          <div className="flex flex-col">
            <span className="text-[15px]">{label}</span>
            {hint ? (
              <span className="mt-0.5 text-[11px] text-warm-ivory/40">
                {hint}
              </span>
            ) : null}
          </div>
          <span className="transition-transform duration-300 ease-atmospheric group-open:rotate-90 text-warm-ivory/35">
            <Chevron direction="right" size={14} />
          </span>
        </summary>
        <div className="pb-5">{children}</div>
      </details>
    </li>
  );
}
