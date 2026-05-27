import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { signOut } from "@/lib/actions/auth";
import { isQaToolsEnabled } from "@/lib/qa/gate";
import {
  Brain,
  Chevron,
  Gear,
  Link2,
  Lock,
  LogOut,
  MapPin,
  ShieldCheck,
  Sparkle,
  User,
} from "@/components/icons";
import { MotionPage } from "@/components";
import { PressLink, PressFormButton } from "./client-bits";

export const metadata = { title: "Account · Jarvis" };
export const dynamic = "force-dynamic";

type AccountStatus = {
  hasFounderProfile: boolean;
  memoryCount: number;
  integrationCount: number;
  libraryCount: number;
  pendingCandidates: number;
  libraryNewThisWeek: number;
};

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  viewer: "Viewer",
  demo: "Demo",
};

export default async function AccountPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/account");

  const status = await loadAccountStatus(user.id);
  const displayName =
    user.display_name?.trim() ||
    user.email?.split("@")[0] ||
    "Account";
  const roleKey = (user.role ?? "viewer").toLowerCase();
  const roleLabel = ROLE_LABEL[roleKey] ?? "Viewer";
  const showQaTools = user.role === "owner" && isQaToolsEnabled();

  return (
    <main
      className="lux-page smooth-page mx-auto min-h-[100dvh] w-full max-w-[680px] overflow-x-hidden px-6 text-warm-ivory"
      style={{
        paddingTop: "calc(env(safe-area-inset-top) + 32px)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 36px)",
      }}
    >
      <MotionPage>
      <header className="flex items-baseline justify-between">
        <span className="lux-label">
          Account
        </span>
        <Link
          href="/north"
          className="text-[16px] font-medium text-warm-ivory transition-colors duration-300 ease-atmospheric hover:text-warm-ivory/80"
        >
          Done
        </Link>
      </header>

      <section className="mt-6">
        <h1 className="font-serif text-[52px] italic leading-[1.0] tracking-[-0.01em] text-warm-ivory">
          Your private layer.
        </h1>
        <p className="mt-4 max-w-[36ch] font-serif text-[22px] italic leading-[1.25] text-warm-ivory/70">
          Identity, access, memory, and the systems wired into Jarvis.
        </p>
      </section>

      <Divider />

      <section className="grid grid-cols-[auto_1fr] items-center gap-5">
        <div className="flex flex-col items-center gap-3">
          <Avatar />
          <button
            type="button"
            className="inline-flex items-center gap-2 text-[12px] text-warm-ivory/55 transition-colors duration-300 ease-atmospheric hover:text-warm-ivory/80"
          >
            <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-muted-gold/70" />
            Edit color
          </button>
        </div>
        <div className="min-w-0">
          <div className="truncate font-serif text-[28px] leading-tight text-warm-ivory">
            {displayName}
          </div>
          {user.email ? (
            <div className="mt-1 truncate text-[14px] text-warm-ivory/55">
              {user.email}
            </div>
          ) : null}
          <div className="mt-3">
            <RolePill label={roleLabel} />
          </div>
        </div>
      </section>

      <Divider />

      <nav aria-label="Account navigation">
        <AccountNavRow
          href="/profile"
          icon={<User size={20} />}
          title="Profile"
          description="Identity, North Star, taste, and personal direction."
        />
        <AccountNavRow
          href="/settings/integrations"
          icon={<Link2 size={20} />}
          title="Integrations"
          description="Connected accounts, APIs, and outside signals."
        />
        <AccountNavRow
          href="/settings"
          icon={<Gear size={20} />}
          title="Settings"
          description="Access, session, account state, and app preferences."
        />
        <AccountNavRow
          href="/profile#memory"
          icon={<Brain size={20} />}
          title="Memory"
          description="Pinned principles, learned signals, and what Jarvis keeps."
        />
        <AccountNavRow
          href="/account/memory"
          icon={<Sparkle size={20} />}
          title="Memory proposals"
          description="Pending patterns Jarvis wants to remember. Accept, reject, or archive."
        />
        <AccountNavRow
          href="/account/history"
          icon={<Brain size={20} />}
          title="History"
          description="Everything Jarvis has shown you — saved, passed, expired, archived."
        />
        <AccountNavRow
          href="/account/intelligence"
          icon={<Sparkle size={20} />}
          title="Intelligence"
          description="External sources, scoring, and the curation brain. Refresh Radar here."
        />
        {showQaTools ? (
          <AccountNavRow
            href="/account/qa"
            icon={<ShieldCheck size={20} />}
            title="QA fixtures"
            description="Owner-only test records for Radar, Today, Upcoming, and plans."
          />
        ) : null}
        <SignOutRow />
      </nav>

      <section className="mt-10">
        <div className="lux-label">
          Account State
        </div>
        <AccountStateCard
          sessionActive
          role={roleLabel}
          profileSeeded={status.hasFounderProfile}
          integrationCount={status.integrationCount}
          memoryCount={status.memoryCount}
        />
        {!status.hasFounderProfile ? (
          <p className="mt-4 max-w-[44ch] text-[13px] leading-[1.55] text-warm-ivory/45">
            Founder profile not seeded yet. Run the seed function to unlock
            editable identity, taste, and memory fields.
          </p>
        ) : null}
      </section>

      <section className="mt-10">
        <div className="lux-label">
          Places Library
        </div>
        <AccountNavRow
          href="/account/library"
          icon={<MapPin size={20} />}
          title="Browse Library"
          description={
            status.libraryCount > 0
              ? `${status.libraryCount} place${status.libraryCount !== 1 ? "s" : ""} known${status.libraryNewThisWeek > 0 ? ` · ${status.libraryNewThisWeek} new this week` : ""}`
              : "The Scout is building your library autonomously."
          }
        />
        {status.pendingCandidates > 0 ? (
          <p className="mt-3 text-[13px] leading-[1.5] text-warm-ivory/40">
            {status.pendingCandidates} candidate{status.pendingCandidates !== 1 ? "s" : ""} in the research queue.
          </p>
        ) : null}
      </section>

      <footer className="mt-12 flex items-center justify-center gap-2 text-[12px] text-warm-ivory/35">
        <Lock size={12} />
        <span>All data is private and encrypted.</span>
      </footer>
      </MotionPage>
    </main>
  );
}

async function loadAccountStatus(userId: string): Promise<AccountStatus> {
  try {
    const supabase = await getServerSupabase();
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [founderRes, memoryRes, libraryRes, pendingRes, newThisWeekRes] =
      await Promise.all([
        supabase
          .from("founder_profile")
          .select("id")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("memory_items")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("status", "active"),
        supabase
          .from("places_library")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),
        supabase
          .from("place_candidates")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("status", "pending"),
        supabase
          .from("places_library")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .gte("first_seen_at", oneWeekAgo),
      ]);

    if (founderRes.error) {
      console.error("[surface-loader] account.founderProfile", founderRes.error);
    }
    if (memoryRes.error) {
      console.error("[surface-loader] account.memoryCount", memoryRes.error);
    }

    return {
      hasFounderProfile: !!founderRes.data,
      memoryCount: memoryRes.count ?? 0,
      integrationCount: 0,
      libraryCount: libraryRes.count ?? 0,
      pendingCandidates: pendingRes.count ?? 0,
      libraryNewThisWeek: newThisWeekRes.count ?? 0,
    };
  } catch (error) {
    console.error("[surface-loader] account.status", error);
    return {
      hasFounderProfile: false,
      memoryCount: 0,
      integrationCount: 0,
      libraryCount: 0,
      pendingCandidates: 0,
      libraryNewThisWeek: 0,
    };
  }
}

function Divider() {
  return (
    <div
      className="my-8 h-px w-full"
      style={{ background: "rgba(255, 250, 240, 0.06)" }}
    />
  );
}

function Avatar() {
  return (
    <div
      className="h-[112px] w-[112px] rounded-full"
      style={{
        background:
          "radial-gradient(70% 70% at 30% 30%, rgba(208,173,104,0.55) 0%, rgba(184,137,55,0.22) 48%, #11100d 100%)",
        boxShadow:
          "inset 0 -10px 30px rgba(0,0,0,0.45), 0 18px 34px -22px rgba(184,137,55,0.45)",
      }}
      aria-hidden
    />
  );
}

function RolePill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-[var(--radius-soft)] border border-muted-gold/35 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-gold">
      {label}
    </span>
  );
}

function AccountNavRow({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <PressLink
      href={href}
      className="group flex items-center gap-4 border-b border-[rgba(246,239,221,0.065)] py-5 transition-colors duration-300 ease-atmospheric hover:bg-white/[0.014]"
    >
      <IconWell>
        <span className="text-muted-gold">{icon}</span>
      </IconWell>
      <div className="min-w-0 flex-1">
        <div className="font-serif text-[24px] leading-tight text-warm-ivory">
          {title}
        </div>
        <p className="mt-1 max-w-[40ch] text-[14px] leading-[1.5] text-warm-ivory/55">
          {description}
        </p>
      </div>
      <Chevron
        direction="right"
        size={16}
        className="shrink-0 text-warm-ivory/35 transition-colors duration-300 ease-atmospheric group-hover:text-warm-ivory/65"
      />
    </PressLink>
  );
}

function SignOutRow() {
  return (
    <PressFormButton
      action={signOut}
      className="group flex w-full items-center gap-4 border-b border-[rgba(246,239,221,0.065)] py-5 text-left transition-colors duration-300 ease-atmospheric hover:bg-white/[0.014]"
    >
      <IconWell>
        <span className="text-[#E07A6E]">
          <LogOut size={20} />
        </span>
      </IconWell>
      <div className="min-w-0 flex-1">
        <div className="font-serif text-[24px] leading-tight text-[#E07A6E]">
          Sign out
        </div>
        <p className="mt-1 text-[14px] leading-[1.5] text-warm-ivory/55">
          End this session.
        </p>
      </div>
      <Chevron
        direction="right"
        size={16}
        className="shrink-0 text-warm-ivory/35 transition-colors duration-300 ease-atmospheric group-hover:text-warm-ivory/65"
      />
    </PressFormButton>
  );
}

function IconWell({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/[0.07] bg-white/[0.018]">
      {children}
    </span>
  );
}

function AccountStateCard({
  sessionActive,
  role,
  profileSeeded,
  integrationCount,
  memoryCount,
}: {
  sessionActive: boolean;
  role: string;
  profileSeeded: boolean;
  integrationCount: number;
  memoryCount: number;
}) {
  return (
    <div
      className="lux-surface mt-4 rounded-[var(--radius-card)] px-5 py-2"
    >
      <StateRow
        icon={<SessionDot active={sessionActive} />}
        label="Session"
        value={
          <span
            className={
              sessionActive
                ? "text-[#7BC4A0]"
                : "text-warm-ivory/45"
            }
          >
            {sessionActive ? "Active" : "Inactive"}
          </span>
        }
      />
      <StateRow
        icon={<ShieldCheck size={16} className="text-muted-gold" />}
        label="Access"
        value={role}
      />
      <StateRow
        icon={<User size={16} className="text-muted-gold" />}
        label="Profile"
        value={profileSeeded ? "Seeded" : "Not seeded"}
      />
      <StateRow
        icon={<Link2 size={16} className="text-muted-gold" />}
        label="Integrations"
        value={`${integrationCount} connected`}
      />
      <StateRow
        icon={<Brain size={16} className="text-muted-gold" />}
        label="Memory"
        value={`${memoryCount} active items`}
        last
      />
    </div>
  );
}

function StateRow({
  icon,
  label,
  value,
  last = false,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between gap-4 py-3.5"
      style={
        last
          ? undefined
          : { borderBottom: "1px solid rgba(255, 250, 240, 0.05)" }
      }
    >
      <div className="flex items-center gap-3">
        <span className="shrink-0">{icon}</span>
        <span className="text-[14px] text-warm-ivory/85">{label}</span>
      </div>
      <span className="text-[14px] text-warm-ivory/65">{value}</span>
    </div>
  );
}

function SessionDot({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden
      className="inline-flex h-4 w-4 items-center justify-center"
    >
      <span
        className={
          "h-3 w-3 rounded-full border " +
          (active
            ? "border-[#7BC4A0]"
            : "border-warm-ivory/30")
        }
      />
    </span>
  );
}
