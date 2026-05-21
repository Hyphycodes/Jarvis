import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { signOut } from "@/lib/actions/auth";
import { RefreshButton, ShowOrigin } from "./client-bits";

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
  };

  return (
    <div
      className="mx-auto w-full max-w-[520px] bg-near-black px-6 text-warm-ivory"
      style={{
        paddingTop: "calc(env(safe-area-inset-top) + 24px)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 64px)",
      }}
    >
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-editorial text-muted-gold">
            Settings
          </div>
          <h1 className="mt-2 font-serif text-[40px] italic leading-[1.02] tracking-[-0.01em] text-warm-ivory">
            Where you stand.
          </h1>
          <p className="mt-2 font-serif text-[15px] italic leading-[1.5] text-warm-ivory/65">
            Account, access, and a quiet check that everything is wired up.
          </p>
          <div className="mt-3 h-px w-8 bg-muted-gold/50" />
        </div>
        <Link
          href="/profile"
          className="border border-divider px-3 py-1.5 text-[10px] uppercase tracking-editorial text-warm-ivory/70 transition-colors duration-300 ease-atmospheric hover:text-warm-ivory"
        >
          Profile
        </Link>
      </header>

      {/* Account */}
      <Section eyebrow="Account">
        <Field label="Email" value={user.email ?? "—"} />
        <Field label="User id" value={user.id} mono />
        <Field
          label="Role"
          value={
            <RoleChip
              role={user.role}
              missing={!user.role}
            />
          }
        />
        <Field
          label="Session"
          value={
            <span className="inline-flex items-center gap-2 text-[13px] text-warm-ivory/85">
              <Dot color="gold" />
              Active
            </span>
          }
        />
      </Section>

      {/* Access */}
      <Section eyebrow="Access">
        <p className="font-serif text-[15px] italic leading-[1.5] text-warm-ivory/85">
          {user.role === "owner"
            ? "Full editing access."
            : user.role === "viewer"
              ? "Read-only demo access."
              : "Role not assigned."}
        </p>
      </Section>

      {/* Profile status */}
      <Section eyebrow="Profile status">
        <Field
          label="profiles row"
          value={<YesNo ok={status.hasProfile} />}
        />
        <Field
          label="founder_profile"
          value={<YesNo ok={status.hasFounderProfile} />}
        />
        <Field
          label="memory_items"
          value={
            <span className="text-[14px] text-warm-ivory/85">
              {status.memoryCount} active
            </span>
          }
        />
        <Field
          label="taste_signals"
          value={
            <span className="text-[14px] text-warm-ivory/85">
              {status.signalCount} total
            </span>
          }
        />
        {user.role === "owner" && !status.hasFounderProfile ? (
          <p className="mt-3 font-serif text-[13px] italic leading-[1.5] text-warm-ivory/65">
            Owner detected but no founder identity row exists. Run the seed
            command to populate it.
          </p>
        ) : null}
      </Section>

      {/* Environment check */}
      <Section eyebrow="Environment">
        <Field
          label="Supabase URL"
          value={<YesNo ok={envCheck.supabaseUrl} />}
        />
        <Field
          label="Supabase anon key"
          value={<YesNo ok={envCheck.supabaseAnon} />}
        />
        <Field
          label="NEXT_PUBLIC_SITE_URL"
          value={
            envCheck.siteUrl ? (
              <span className="break-all text-[13px] text-warm-ivory/85">
                {envCheck.siteUrl}
              </span>
            ) : (
              <span className="text-[13px] text-muted-gold/85">
                Not set
              </span>
            )
          }
        />
        <Field label="Window origin" value={<ShowOrigin />} />
      </Section>

      {/* Actions */}
      <Section eyebrow="Actions">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/profile"
              className="block border border-divider px-4 py-3 text-center text-[11px] uppercase tracking-editorial text-warm-ivory/85 transition-colors duration-300 ease-atmospheric hover:border-warm-ivory/40"
            >
              Profile
            </Link>
            <Link
              href="/login"
              className="block border border-divider px-4 py-3 text-center text-[11px] uppercase tracking-editorial text-warm-ivory/85 transition-colors duration-300 ease-atmospheric hover:border-warm-ivory/40"
            >
              Login screen
            </Link>
          </div>
          <RefreshButton />
          <form action={signOut}>
            <button
              type="submit"
              className="w-full border border-muted-gold/40 px-4 py-3 text-center text-[11px] uppercase tracking-editorial text-muted-gold transition-colors duration-300 ease-atmospheric hover:border-muted-gold"
            >
              Sign out
            </button>
          </form>
        </div>
      </Section>

      <footer className="mt-12 border-t border-divider/70 pt-6 text-[11px] uppercase tracking-editorial text-warm-ivory/45">
        Jarvis · private
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

async function loadAccountStatus(userId: string) {
  const supabase = await getServerSupabase();

  const [profileRes, founderRes, memoryRes, signalRes] = await Promise.all([
    supabase.from("profiles").select("id").eq("id", userId).maybeSingle(),
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
    hasFounderProfile: !!founderRes.data,
    memoryCount: memoryRes.count ?? 0,
    signalCount: signalRes.count ?? 0,
  };
}

function Section({
  eyebrow,
  children,
}: {
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10 border-t border-divider/70 pt-6">
      <div className="text-[11px] uppercase tracking-editorial text-muted-gold">
        {eyebrow}
      </div>
      <div className="mt-4 flex flex-col">{children}</div>
    </section>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-start gap-4 border-b border-divider/40 py-3">
      <div className="text-[10px] uppercase tracking-editorial text-warm-ivory/45">
        {label}
      </div>
      <div
        className={
          "min-w-0 text-[14px] leading-[1.5] text-warm-ivory/85 " +
          (mono ? "font-mono text-[12px] break-all" : "")
        }
      >
        {value}
      </div>
    </div>
  );
}

function Dot({ color }: { color: "gold" | "muted" }) {
  return (
    <span
      aria-hidden
      className={
        "inline-block h-1.5 w-1.5 rounded-full " +
        (color === "gold" ? "bg-muted-gold" : "bg-warm-ivory/40")
      }
    />
  );
}

function YesNo({ ok }: { ok: boolean }) {
  return (
    <span
      className={
        "inline-flex items-center gap-2 text-[13px] " +
        (ok ? "text-warm-ivory/85" : "text-muted-gold/85")
      }
    >
      <Dot color={ok ? "gold" : "muted"} />
      {ok ? "Yes" : "No"}
    </span>
  );
}

function RoleChip({
  role,
  missing,
}: {
  role: "owner" | "viewer" | null | undefined;
  missing: boolean;
}) {
  if (missing || !role) {
    return (
      <span className="inline-flex items-center gap-1.5 border border-divider px-2 py-0.5 text-[10px] uppercase tracking-editorial text-muted-gold/85">
        Not assigned
      </span>
    );
  }
  const owner = role === "owner";
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 border px-2 py-0.5 text-[10px] uppercase tracking-editorial " +
        (owner
          ? "border-muted-gold/50 text-muted-gold"
          : "border-divider text-warm-ivory/65")
      }
    >
      <span
        aria-hidden
        className={
          "h-1.5 w-1.5 rounded-full " +
          (owner ? "bg-muted-gold" : "bg-warm-ivory/40")
        }
      />
      {role}
    </span>
  );
}
