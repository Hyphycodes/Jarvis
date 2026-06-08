import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getProfile } from "@/lib/actions/profile";
import { getOperatingPreferences } from "@/lib/actions/operatingPreferences";
import { DEFAULT_OPERATING_PREFERENCES } from "@/lib/operating/operatingPreferences";
import {
  DEFAULT_WEEKLY_RHYTHM,
  normalizeWeeklyRhythm,
} from "@/lib/schedule/weeklyRhythm";
import { signOut } from "@/lib/actions/auth";
import { Chevron, Lock } from "@/components/icons";
import { MotionPage } from "@/components";
import { OperatingModeCard } from "@/components/settings/OperatingModeCard";
import { SpendCard } from "@/components/settings/SpendCard";
import { TasteCard } from "@/components/settings/TasteCard";
import { RhythmCard } from "@/components/settings/RhythmCard";

export const metadata = { title: "Private Layer · Jarvis" };
export const dynamic = "force-dynamic";

/**
 * The Private Layer — a calm control surface for the core context Jarvis obeys.
 * Summary-first cards; raw memory/signals/diagnostics live under owner-only
 * Advanced or direct URLs only. Changing a control here changes how Jarvis moves.
 */
export default async function AccountPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/account");
  const owner = user.role === "owner";

  const { profile, founder } = await getProfile();
  const operating = owner
    ? await getOperatingPreferences().catch(() => DEFAULT_OPERATING_PREFERENCES)
    : DEFAULT_OPERATING_PREFERENCES;
  const weeklyRhythm = normalizeWeeklyRhythm(founder?.weekly_rhythm ?? DEFAULT_WEEKLY_RHYTHM);

  const displayName = profile?.display_name?.trim() || user.email?.split("@")[0] || "You";
  const homeBase = profile?.home_city?.trim() || "—";
  const timezone = profile?.timezone?.trim() || weeklyRhythm.timezone || "—";

  return (
    <main
      className="lux-page smooth-page mx-auto min-h-[100dvh] w-full max-w-[520px] overflow-x-hidden px-5 text-warm-ivory"
      style={{
        paddingTop: "calc(env(safe-area-inset-top) + 28px)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 88px)",
      }}
    >
      <MotionPage>
        <header className="flex items-baseline justify-between">
          <span className="lux-label">Private Layer</span>
          <Link
            href="/north"
            className="text-[15px] font-medium text-warm-ivory transition-colors duration-300 ease-atmospheric hover:text-warm-ivory/80"
          >
            Done
          </Link>
        </header>

        <section className="mt-5">
          <h1 className="font-serif text-[40px] italic leading-[1.04] tracking-[-0.01em] text-warm-ivory">
            Change how Jarvis moves.
          </h1>
          <p className="mt-3 max-w-[40ch] font-serif text-[16px] italic leading-[1.4] text-warm-ivory/65">
            Adjust the context Jarvis obeys — and Radar, Today, Finds, and North respond.
          </p>
        </section>

        {/* 1. Profile */}
        <ProfileCard displayName={displayName} homeBase={homeBase} timezone={timezone} email={profile?.email ?? user.email ?? null} />

        {/* 2. Operating Mode */}
        <OperatingModeCard initialMode={operating.operatingMode} editable={owner} />

        {/* 3. Spend */}
        <SpendCard initial={operating} editable={owner} />

        {/* 4. Taste */}
        <TasteCard
          likes={founder?.vibe_keywords ?? []}
          avoids={founder?.avoid_keywords ?? []}
          editable={owner}
        />

        {/* 5. Rhythm */}
        <RhythmCard
          initial={operating}
          weeklyRhythm={weeklyRhythm}
          weeklyRhythmSavedAt={typeof founder?.updated_at === "string" ? founder.updated_at : null}
          editable={owner}
        />

        {/* 6. Connections */}
        <ConnectionsCard owner={owner} />

        {/* 7. Data & Privacy */}
        <DataPrivacyCard />

        {/* 8. Advanced — owner only, collapsed */}
        {owner ? <AdvancedSection /> : null}

        <footer className="mt-12 flex flex-col items-center gap-5 text-[12px] text-warm-ivory/35">
          <div className="flex items-center gap-2">
            <Lock size={12} />
            <span>All data is private and encrypted.</span>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              className="min-h-11 border border-divider px-5 text-[11px] uppercase tracking-editorial text-warm-ivory/55 transition duration-300 ease-atmospheric hover:border-[#E07A6E]/45 hover:text-[#E07A6E]"
            >
              Sign out
            </button>
          </form>
        </footer>
      </MotionPage>
    </main>
  );
}

function CardShell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="mt-4 rounded-2xl border border-white/[0.07] bg-white/[0.018] px-5 py-5">
      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-gold/80">{label}</div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function ProfileCard({
  displayName,
  homeBase,
  timezone,
  email,
}: {
  displayName: string;
  homeBase: string;
  timezone: string;
  email: string | null;
}) {
  return (
    <CardShell label="Profile">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-serif text-[24px] leading-tight text-warm-ivory">{displayName}</div>
          <div className="mt-1 text-[13px] text-warm-ivory/55">{homeBase}</div>
          <div className="text-[13px] text-warm-ivory/40">{timezone}</div>
          {email ? <div className="mt-1 text-[12px] text-warm-ivory/40">{email}</div> : null}
        </div>
        <Link
          href="/profile"
          className="shrink-0 text-[11px] uppercase tracking-[0.18em] text-muted-gold transition-colors hover:text-muted-gold/80"
        >
          Edit
        </Link>
      </div>
    </CardShell>
  );
}

function ConnectionsCard({ owner }: { owner: boolean }) {
  const rows = [
    { name: "Calendar", use: "Today, plan timing, and avoiding bad windows." },
    { name: "Maps & Places", use: "Discovery, routing, and neighborhood context." },
    { name: "Contacts", use: "Circle and planning with people." },
    { name: "Music", use: "Mood, playlists, and creative context (later)." },
  ];
  return (
    <CardShell label="Connections">
      <ul className="flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.name} className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[14px] text-warm-ivory/85">{r.name}</div>
              <div className="text-[12px] leading-[1.45] text-warm-ivory/45">{r.use}</div>
            </div>
          </li>
        ))}
      </ul>
      {owner ? (
        <Link
          href="/settings/integrations"
          className="mt-4 inline-block text-[11px] uppercase tracking-[0.18em] text-muted-gold transition-colors hover:text-muted-gold/80"
        >
          Manage connections
        </Link>
      ) : null}
    </CardShell>
  );
}

function DataPrivacyCard() {
  return (
    <CardShell label="Data & privacy">
      <p className="text-[14px] leading-[1.5] text-warm-ivory/65">
        Jarvis learns from your plans, saves, passes, and reflections — and you can
        correct what it understands.
      </p>
      <Link
        href="/account/memory"
        className="mt-4 flex items-center justify-between border-t border-divider/40 pt-3 text-[14px] text-warm-ivory/85 transition-colors hover:text-warm-ivory"
      >
        <span>What Jarvis remembers</span>
        <Chevron direction="right" size={14} className="text-warm-ivory/35" />
      </Link>
    </CardShell>
  );
}

function AdvancedSection() {
  const links = [
    { href: "/account/memory", label: "Raw memory" },
    { href: "/account/tastemakers", label: "Tastemakers" },
    { href: "/account/library", label: "Places library" },
    { href: "/account/intelligence", label: "Intelligence diagnostics" },
    { href: "/account/qa", label: "QA" },
    { href: "/settings/integrations", label: "Integrations" },
    { href: "/settings/library", label: "Control Room" },
  ];
  return (
    <section className="mt-4 rounded-2xl border border-white/[0.05] bg-white/[0.012] px-5 py-4">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between text-[11px] uppercase tracking-[0.2em] text-warm-ivory/40">
          <span>Advanced</span>
          <span className="transition-transform duration-300 ease-atmospheric group-open:rotate-90">
            <Chevron direction="right" size={14} />
          </span>
        </summary>
        <ul className="mt-3 flex flex-col">
          {links.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="flex items-center justify-between border-t border-divider/30 py-3 text-[13px] text-warm-ivory/65 transition-colors hover:text-warm-ivory"
              >
                <span>{l.label}</span>
                <Chevron direction="right" size={13} className="text-warm-ivory/30" />
              </Link>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
