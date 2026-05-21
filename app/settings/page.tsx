import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { signOut } from "@/lib/actions/auth";
import { authCallbackUrl, siteOrigin } from "@/lib/siteOrigin";
import { Chevron } from "@/components/icons";
import { BackButton, MotionPage } from "@/components";
import { CopyButton, ShowOrigin } from "./client-bits";

export const metadata = { title: "Settings · Jarvis" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/settings");

  const status = await loadAccountStatus(user.id);
  const envCheck = {
    supabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnon: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? null,
    detectedOrigin: siteOrigin(),
    callbackUrl: authCallbackUrl(),
  };
  const owner = user.role === "owner";

  return (
    <main
      className="smooth-page mx-auto min-h-[100dvh] w-full max-w-[520px] overflow-x-hidden bg-near-black px-6 text-warm-ivory"
      style={{
        paddingTop: "calc(env(safe-area-inset-top) + 28px)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 72px)",
      }}
    >
      <MotionPage>
      <header>
        <div className="flex items-center gap-1">
          <BackButton fallbackHref="/account" />
          <span className="text-[11px] uppercase tracking-editorial text-muted-gold">
            Settings
          </span>
        </div>
        <h1 className="mt-6 font-serif text-[42px] italic leading-[1.02] text-warm-ivory">
          Control room.
        </h1>
        <p className="mt-3 max-w-[38ch] font-serif text-[16px] italic leading-[1.45] text-warm-ivory/65">
          Account, access, and the systems behind your private layer.
        </p>
        <div className="mt-5 h-px w-10 bg-muted-gold/50" />
      </header>

      <SettingsSection label="Account">
        <div className="rounded-md border border-divider/60 bg-soft-black/35 px-4 py-4">
          <Field label="Signed in as" value={user.email ?? "Account active"} />
          <Field label="Role" value={<RoleChip role={user.role} />} />
          <Field label="Session" value={<StatusValue label="Active" />} />
          <p className="mt-4 border-t border-divider/45 pt-4 font-serif text-[15px] italic leading-[1.5] text-warm-ivory/75">
            {owner ? "Private owner access." : "Read-only demo access."}
          </p>
        </div>
      </SettingsSection>

      <SettingsSection label="Profile">
        <div className="grid gap-2">
          <ProfileMetric
            label="Founder Profile"
            value={status.hasFounderProfile ? "Active" : "Not set"}
            active={status.hasFounderProfile}
          />
          <ProfileMetric
            label="Memory"
            value={`${status.memoryCount} active`}
            active={status.memoryCount > 0}
          />
          <ProfileMetric
            label="Taste Signals"
            value={`${status.signalCount} total`}
            active={status.signalCount > 0}
          />
        </div>
        {owner && !status.hasFounderProfile ? (
          <div className="mt-4 rounded-md border border-muted-gold/25 bg-muted-gold/[0.05] px-4 py-4">
            <h2 className="font-serif text-[20px] italic leading-tight text-warm-ivory">
              Founder profile not set yet.
            </h2>
            <p className="mt-2 text-[13px] leading-[1.55] text-warm-ivory/60">
              Your owner access is active. Add the founder layer when you are
              ready to teach Jarvis your taste, principles, and memory.
            </p>
            <Link
              href="/profile"
              className="mt-4 inline-flex min-h-10 items-center gap-2 border border-muted-gold/45 px-4 text-[11px] uppercase tracking-editorial text-muted-gold transition duration-300 ease-atmospheric hover:border-muted-gold active:translate-y-px"
            >
              Seed Founder Profile
              <Chevron direction="right" size={13} />
            </Link>
          </div>
        ) : null}
        <Link
          href="/profile"
          className="mt-5 flex min-h-12 items-center justify-between border-t border-divider/60 pt-4 text-[11px] uppercase tracking-editorial text-warm-ivory/70 transition duration-300 ease-atmospheric hover:text-warm-ivory active:translate-y-px"
        >
          <span>Open Profile</span>
          <Chevron direction="right" size={14} className="text-warm-ivory/45" />
        </Link>
      </SettingsSection>

      <SettingsSection label="Controls">
        <div className="grid gap-3">
          <SettingsCard
            href="/settings/integrations"
            title="Integrations"
            copy="Control what Jarvis can access, when it refreshes, and how much it spends."
          />
          <SettingsCard
            title="Preferences"
            copy="Adjust how Jarvis presents itself."
            status="Queued"
          />
          <SettingsCard
            title="Data & Memory"
            copy="Review saved context, taste signals, and personal memory."
            status="Queued"
          />
        </div>
      </SettingsSection>

      <SettingsSection label="System">
        <SystemDiagnostics
          userId={user.id}
          envCheck={envCheck}
          status={status}
        />
      </SettingsSection>

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

  const [profileRes, founderRes, memoryRes, signalRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, app_role")
      .eq("id", userId)
      .maybeSingle(),
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
      .from("taste_signals")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
  ]);

  return {
    hasProfile: !!profileRes.data,
    profileRole: profileRes.data?.app_role ?? null,
    hasFounderProfile: !!founderRes.data,
    memoryCount: memoryRes.count ?? 0,
    signalCount: signalRes.count ?? 0,
  };
}

function SettingsSection({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <section className="motion-card mt-10 border-t border-divider/60 pt-6">
      <div className="text-[11px] uppercase tracking-editorial text-muted-gold">
        {label}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[118px_1fr] items-start gap-4 border-b border-divider/35 py-3 last:border-0">
      <div className="text-[10px] uppercase tracking-editorial text-warm-ivory/45">
        {label}
      </div>
      <div className="min-w-0 text-[14px] leading-[1.5] text-warm-ivory/85">
        {value}
      </div>
    </div>
  );
}

function ProfileMetric({
  label,
  value,
  active,
}: {
  label: string;
  value: string;
  active: boolean;
}) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-4 rounded-md border border-divider/50 bg-soft-black/25 px-4">
      <span className="text-[13px] text-warm-ivory/75">{label}</span>
      <StatusValue label={value} muted={!active} />
    </div>
  );
}

function SettingsCard({
  href,
  title,
  copy,
  status,
}: {
  href?: string;
  title: string;
  copy: string;
  status?: string;
}) {
  const content = (
    <>
      <div>
        <div className="font-serif text-[20px] italic leading-tight text-warm-ivory">
          {title}
        </div>
        <p className="mt-2 max-w-[36ch] text-[13px] leading-[1.55] text-warm-ivory/58">
          {copy}
        </p>
      </div>
      <span className="shrink-0 text-[10px] uppercase tracking-editorial text-muted-gold/70">
        {status ?? (
          <Chevron
            direction="right"
            size={14}
            className="text-warm-ivory/45"
          />
        )}
      </span>
    </>
  );

  const className =
    "flex min-h-[104px] items-center justify-between gap-5 rounded-md border border-divider/55 bg-soft-black/25 px-4 py-4 text-left transition duration-300 ease-atmospheric hover:border-muted-gold/35 hover:bg-soft-black/45 active:translate-y-px";

  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" className={className}>
      {content}
    </button>
  );
}

function SystemDiagnostics({
  userId,
  envCheck,
  status,
}: {
  userId: string;
  envCheck: {
    supabaseUrl: boolean;
    supabaseAnon: boolean;
    siteUrl: string | null;
    detectedOrigin: string;
    callbackUrl: string;
  };
  status: {
    hasProfile: boolean;
    profileRole: string | null;
    hasFounderProfile: boolean;
    memoryCount: number;
    signalCount: number;
  };
}) {
  return (
    <details className="group rounded-md border border-divider/55 bg-soft-black/20">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-4 text-[11px] uppercase tracking-editorial text-warm-ivory/60 transition-colors duration-300 ease-atmospheric hover:text-warm-ivory">
        <span>System Diagnostics</span>
        <Chevron
          direction="down"
          size={14}
          className="text-muted-gold transition-transform duration-300 ease-atmospheric group-open:rotate-180"
        />
      </summary>
      <div className="border-t border-divider/45 px-4 pb-4 pt-2">
        <DiagnosticRow label="User ID" value={userId} copy />
        <DiagnosticRow
          label="NEXT_PUBLIC_SITE_URL"
          value={envCheck.siteUrl ?? "Not set"}
          copy={!!envCheck.siteUrl}
        />
        <DiagnosticRow
          label="Detected Origin"
          value={envCheck.detectedOrigin}
          copy
        />
        <DiagnosticRow label="Callback URL" value={envCheck.callbackUrl} copy />
        <DiagnosticRow label="Window Origin" value={<ShowOrigin />} />
        <DiagnosticRow
          label="Supabase URL present"
          value={envCheck.supabaseUrl ? "Yes" : "No"}
        />
        <DiagnosticRow
          label="Supabase anon key present"
          value={envCheck.supabaseAnon ? "Yes" : "No"}
        />
        <DiagnosticRow
          label="profiles row"
          value={status.hasProfile ? `Yes (${status.profileRole ?? "unknown"})` : "No"}
        />
        <DiagnosticRow
          label="founder profile status"
          value={status.hasFounderProfile ? "Active" : "Not set"}
        />
        <DiagnosticRow label="memory count" value={String(status.memoryCount)} />
        <DiagnosticRow
          label="taste signal count"
          value={String(status.signalCount)}
        />
      </div>
    </details>
  );
}

function DiagnosticRow({
  label,
  value,
  copy,
}: {
  label: string;
  value: ReactNode;
  copy?: boolean;
}) {
  const copyValue = typeof value === "string" ? value : null;
  return (
    <div className="grid grid-cols-[132px_1fr_auto] items-start gap-3 border-b border-divider/30 py-3 last:border-0">
      <div className="text-[10px] uppercase tracking-editorial text-warm-ivory/35">
        {label}
      </div>
      <div className="min-w-0 break-words font-mono text-[11px] leading-[1.55] text-warm-ivory/58">
        {value}
      </div>
      {copy && copyValue ? <CopyButton value={copyValue} /> : <span />}
    </div>
  );
}

function RoleChip({ role }: { role: "owner" | "viewer" }) {
  return (
    <span
      className={
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] uppercase tracking-editorial " +
        (role === "owner"
          ? "border-muted-gold/45 text-muted-gold"
          : "border-divider text-warm-ivory/58")
      }
    >
      <span
        aria-hidden
        className={
          "h-1.5 w-1.5 rounded-full " +
          (role === "owner" ? "bg-muted-gold" : "bg-warm-ivory/40")
        }
      />
      {role === "owner" ? "Owner" : "Viewer"}
    </span>
  );
}

function StatusValue({
  label,
  muted = false,
}: {
  label: string;
  muted?: boolean;
}) {
  return (
    <span
      className={
        "inline-flex items-center gap-2 text-[13px] " +
        (muted ? "text-warm-ivory/45" : "text-warm-ivory/85")
      }
    >
      <span
        aria-hidden
        className={
          "h-1.5 w-1.5 rounded-full " +
          (muted ? "bg-warm-ivory/30" : "bg-muted-gold")
        }
      />
      {label}
    </span>
  );
}
