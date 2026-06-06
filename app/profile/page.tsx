import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getProfile } from "@/lib/actions/profile";
import { listMemoryItems } from "@/lib/actions/memory";
import { listTasteSignals } from "@/lib/actions/taste";
import { listIndexItems } from "@/lib/index/repo";
import { signOut } from "@/lib/actions/auth";
import { BackButton, MotionPage } from "@/components";
import { ProfileEditableField } from "@/components/profile/ProfileFields";

export const metadata = {
  title: "Profile · Jarvis",
};

export const dynamic = "force-dynamic";

/**
 * Founder profile — intentionally minimal.
 *
 * One quiet screen: identity, a single Jarvis-learning status card, a few
 * management links, sign out. Everything richer (North Star, taste tags, full
 * memory list, signal rows, principles, growth edges, "memory rules" essay,
 * admin / control-room) lives behind the dedicated /account/* sub-pages and
 * is intentionally NOT rendered here. Data + actions are untouched.
 */
export default async function ProfilePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/profile");

  const { profile } = await getProfile();
  const [memory, signals, places] = await Promise.all([
    listMemoryItems().catch(() => []),
    listTasteSignals().catch(() => []),
    listIndexItems({ type: "place" }).catch(() => []),
  ]);

  const editable = user.role === "owner";

  return (
    <div
      className="mx-auto w-full max-w-[520px] bg-near-black px-6 text-warm-ivory"
      style={{
        paddingTop: "calc(env(safe-area-inset-top) + 24px)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 64px)",
      }}
    >
      <MotionPage>
        <header className="flex items-center gap-1">
          <BackButton fallbackHref="/account" />
          <span className="text-[11px] uppercase tracking-editorial text-muted-gold">
            Founder
          </span>
        </header>

        {/* 1. Founder — quiet identity rows. Inline edit on each row. */}
        <section className="mt-10">
          <h2 className="font-serif text-[32px] italic leading-[1.05] tracking-[-0.005em] text-warm-ivory">
            {profile?.display_name || "Profile"}
          </h2>
          <div className="mt-1 text-[12px] text-warm-ivory/45">
            {profile?.email ?? user.email}
          </div>
          <div className="mt-6 h-px w-8 bg-muted-gold/40" />

          <div className="mt-6">
            <ProfileEditableField
              label="Display name"
              value={profile?.display_name}
              field="display_name"
              editable={editable}
              placeholder="Add a name"
            />
            <ProfileEditableField
              label="Home city"
              value={profile?.home_city}
              field="home_city"
              editable={editable}
              placeholder="Add a city"
            />
            <ProfileEditableField
              label="Timezone"
              value={profile?.timezone}
              field="timezone"
              editable={editable}
              placeholder="e.g. America/Chicago"
            />
            <div className="grid grid-cols-[140px_1fr] items-start gap-4 border-b border-divider/40 py-3">
              <div className="text-[10px] uppercase tracking-editorial text-warm-ivory/45">
                Email
              </div>
              <div className="text-[14px] text-warm-ivory/75">
                {profile?.email ?? user.email ?? "—"}
              </div>
            </div>
          </div>
        </section>

        {/* 2. Jarvis Learning — one calm status card with small stats. */}
        <section className="mt-12">
          <div
            className="border-l-2 border-muted-gold/40 bg-soft-black/60 px-4 py-4"
            aria-label="Jarvis learning status"
          >
            <p className="font-serif text-[15px] italic leading-[1.55] text-warm-ivory/80">
              Jarvis is learning from your plans, saves, passes, conversations,
              and calendar.
            </p>
            <dl className="mt-4 flex gap-6 text-[11px] uppercase tracking-editorial text-warm-ivory/55">
              <StatChip label="Memories" value={memory.length} />
              <StatChip label="Taste signals" value={signals.length} />
              <StatChip label="Places" value={places.length} />
            </dl>
          </div>
        </section>

        {/* 3. Simple actions — manage screens live elsewhere. */}
        <section className="mt-10">
          <ul className="flex flex-col">
            <ActionLink href="/account/tastemakers" label="Manage Taste" />
            <ActionLink href="/account/library" label="Manage Places" />
          </ul>
        </section>

        <footer className="mt-16 flex items-center justify-between border-t border-divider/70 pt-6 text-[11px] uppercase tracking-editorial text-warm-ivory/45">
          <span>{profile?.email ?? user.email}</span>
          <form action={signOut}>
            <button
              type="submit"
              className="text-warm-ivory/55 transition-colors duration-300 ease-atmospheric hover:text-warm-ivory/85"
            >
              Sign out
            </button>
          </form>
        </footer>
      </MotionPage>
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-warm-ivory/45">{label}</dt>
      <dd className="font-serif text-[20px] not-italic leading-none text-warm-ivory/85">
        {value}
      </dd>
    </div>
  );
}

function ActionLink({ href, label }: { href: string; label: string }) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center justify-between border-b border-divider/40 py-4 text-[14px] text-warm-ivory/85 transition-colors duration-300 ease-atmospheric hover:text-warm-ivory"
      >
        <span>{label}</span>
        <span className="text-warm-ivory/35" aria-hidden>
          ›
        </span>
      </Link>
    </li>
  );
}
