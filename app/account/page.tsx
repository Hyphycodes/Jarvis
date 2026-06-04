import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { signOut } from "@/lib/actions/auth";
import {
  Chevron,
  Gear,
  Lock,
  LogOut,
  Sparkle,
  User,
} from "@/components/icons";
import { MotionPage } from "@/components";
import { PressLink, PressFormButton } from "./client-bits";

export const metadata = { title: "Account · Jarvis" };
export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  viewer: "Viewer",
  demo: "Demo",
};

export default async function AccountPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/account");

  const displayName =
    user.display_name?.trim() ||
    user.email?.split("@")[0] ||
    "Account";
  const roleKey = (user.role ?? "viewer").toLowerCase();
  const roleLabel = ROLE_LABEL[roleKey] ?? "Viewer";

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
          Identity, memory, rhythm, and the people shaping your taste.
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
          href="/account/memory"
          icon={<Sparkle size={20} />}
          title="Memory"
          description="Pending patterns Jarvis wants to remember. Accept, reject, or archive."
        />
        <AccountNavRow
          href="/account/tastemakers"
          icon={<Sparkle size={20} />}
          title="Tastemakers"
          description="Promoters, DJs, chefs, and curators whose moves you follow."
        />
        <AccountNavRow
          href="/settings"
          icon={<Gear size={20} />}
          title="Weekly Rhythm"
          description="Workdays, commute windows, and the cadence Jarvis should respect."
        />
        <SignOutRow />
      </nav>

      <footer className="mt-14 flex flex-col items-center justify-center gap-5 text-[12px] text-warm-ivory/35">
        <div className="flex items-center gap-2">
          <Lock size={12} />
          <span>All data is private and encrypted.</span>
        </div>
        <Link
          href="/settings/library"
          className="text-[10px] uppercase tracking-[0.22em] text-warm-ivory/30 transition-colors duration-300 ease-atmospheric hover:text-warm-ivory/55"
        >
          · Control room ·
        </Link>
      </footer>
      </MotionPage>
    </main>
  );
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
