import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getProfile, seedFounderProfile } from "@/lib/actions/profile";
import { listMemoryItems } from "@/lib/actions/memory";
import { listTasteSignals } from "@/lib/actions/taste";
import { signOut } from "@/lib/actions/auth";
import { Section } from "@/components/profile/Section";
import {
  FounderEditableField,
  FounderEditableTagList,
  ProfileEditableField,
} from "@/components/profile/ProfileFields";
import { MemoryItemCard } from "@/components/profile/MemoryItemCard";
import { TasteSignalRow } from "@/components/profile/TasteSignalRow";
import { ExpandableBlock } from "@/components/profile/ExpandableBlock";
import { CreateMemoryItem } from "@/components/profile/CreateMemoryItem";
import { CreateTasteSignal } from "@/components/profile/CreateTasteSignal";

export const metadata = {
  title: "Profile · Jarvis",
};

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/profile");

  const { profile, founder } = await getProfile();
  const [memory, signals] = await Promise.all([
    listMemoryItems(),
    listTasteSignals(),
  ]);

  const editable = user.role === "owner";
  const isViewerOfFounder = !editable && profile && profile.id !== user.id;
  const profileMissing = !profile;
  const founderMissing = !founder;
  const positive = signals.filter((s) => s.direction === "positive");
  const negative = signals.filter((s) => s.direction === "negative");

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
            {editable ? "Founder" : "Demo view"}
          </div>
          <h1 className="mt-2 font-serif text-[44px] italic leading-[1.02] tracking-[-0.01em] text-warm-ivory">
            {profile?.display_name || "Profile"}
          </h1>
          <p className="mt-2 font-serif text-[15px] italic leading-[1.5] text-warm-ivory/65">
            {isViewerOfFounder
              ? "A read-only window into the founder’s taste memory."
              : "Identity, taste, and the patterns Jarvis is learning."}
          </p>
          <div className="mt-3 h-px w-8 bg-muted-gold/50" />
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <RoleBadge role={user.role} />
          <Link
            href="/settings"
            className="text-[10px] uppercase tracking-editorial text-warm-ivory/55 transition-colors duration-300 ease-atmospheric hover:text-warm-ivory/85"
          >
            Settings
          </Link>
        </div>
      </header>

      {(profileMissing || founderMissing) && !isViewerOfFounder ? (
        <aside
          role="status"
          className="mt-8 border-l-2 border-muted-gold/60 bg-soft-black/60 px-4 py-3 text-[13px] leading-[1.55] text-warm-ivory/85"
        >
          {profileMissing ? (
            <>
              You are signed in, but profile data hasn’t loaded yet.{" "}
              <Link
                href="/settings"
                className="underline decoration-muted-gold/60 underline-offset-2"
              >
                Open settings
              </Link>{" "}
              to verify your account.
            </>
          ) : editable && founderMissing ? (
            <>
              <span className="block font-serif text-[18px] italic text-warm-ivory">
                Founder profile not set yet.
              </span>
              <span className="mt-1 block text-warm-ivory/62">
                Owner access is active. Seed the founder layer when you are
                ready to load the first private profile, memory, and taste
                signals.
              </span>
              <form action={seedFounderProfile} className="mt-4">
                <button
                  type="submit"
                  className="min-h-10 border border-muted-gold/45 px-4 text-[11px] uppercase tracking-editorial text-muted-gold transition duration-300 ease-atmospheric hover:border-muted-gold active:translate-y-px"
                >
                  Seed Founder Profile
                </button>
              </form>
            </>
          ) : (
            <>
              Founder identity not yet seeded. Editable fields will populate
              once the owner runs the seed function.
            </>
          )}
        </aside>
      ) : null}

      {/* Identity */}
      <div className="mt-12">
        <Section
          eyebrow="Identity"
          title="Who Jarvis is reading."
          description="The stable surface — name, place, time."
        >
          <ProfileEditableField
            label="Display name"
            value={profile?.display_name}
            field="display_name"
            editable={editable}
            placeholder="Add a name"
          />
          <ProfileEditableField
            label="Home"
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
        </Section>
      </div>

      {/* North Star */}
      <div className="mt-12">
        <Section
          eyebrow="North Star"
          title="Direction, on purpose."
          description="What this life is pointed at. Edit intentionally."
        >
          <FounderEditableField
            label="Life direction"
            value={founder?.life_direction}
            field="life_direction"
            editable={editable}
            multiline
            placeholder="Where this is headed long-term."
          />
          <FounderEditableField
            label="Current focus"
            value={founder?.current_focus}
            field="current_focus"
            editable={editable}
            multiline
            placeholder="What the next 90 days are about."
          />
          <FounderEditableField
            label="Faith & values"
            value={founder?.faith_values}
            field="faith_values"
            editable={editable}
            multiline
            placeholder="Faith posture, anchoring values."
          />
          <FounderEditableTagList
            label="Pinned principles"
            value={founder?.pinned_principles}
            field="pinned_principles"
            editable={editable}
          />
          <FounderEditableTagList
            label="Values"
            value={founder?.values}
            field="values"
            editable={editable}
          />
          <FounderEditableTagList
            label="Growth edges"
            value={founder?.cultural_growth_edges}
            field="cultural_growth_edges"
            editable={editable}
            placeholder="Stretch territories — opera, jazz lineage…"
          />
        </Section>
      </div>

      {/* Taste */}
      <div className="mt-12">
        <Section
          eyebrow="Taste Profile"
          title="The shape of your yes."
          description="Vibe, energy, and the rooms you want to be in."
        >
          <FounderEditableTagList
            label="Vibe"
            value={founder?.vibe_keywords}
            field="vibe_keywords"
            editable={editable}
          />
          <FounderEditableField
            label="Energy"
            value={founder?.energy_preference}
            field="energy_preference"
            editable={editable}
            placeholder="e.g. elevated but relaxed"
          />
          <FounderEditableField
            label="Social"
            value={founder?.social_preference}
            field="social_preference"
            editable={editable}
            placeholder="e.g. intimate, rooms with weight"
          />
          <FounderEditableField
            label="Luxury style"
            value={founder?.luxury_style}
            field="luxury_style"
            editable={editable}
            placeholder="e.g. subtle"
          />
          <FounderEditableField
            label="Budget posture"
            value={founder?.budget_posture}
            field="budget_posture"
            editable={editable}
            placeholder="How spend is decided."
          />

          <ExpandableBlock label="Domain preferences" defaultOpen={false}>
            <div className="flex flex-col gap-1">
              <FounderEditableTagList
                label="Food"
                value={founder?.food_preferences}
                field="food_preferences"
                editable={editable}
              />
              <FounderEditableTagList
                label="Music"
                value={founder?.music_preferences}
                field="music_preferences"
                editable={editable}
              />
              <FounderEditableTagList
                label="Venues"
                value={founder?.venue_preferences}
                field="venue_preferences"
                editable={editable}
              />
              <FounderEditableTagList
                label="Style"
                value={founder?.style_preferences}
                field="style_preferences"
                editable={editable}
              />
              <FounderEditableTagList
                label="Travel"
                value={founder?.travel_preferences}
                field="travel_preferences"
                editable={editable}
              />
            </div>
          </ExpandableBlock>

          <ExpandableBlock label="Long-arc goals" defaultOpen={false}>
            <div className="flex flex-col gap-1">
              <FounderEditableTagList
                label="Active projects"
                value={founder?.active_projects}
                field="active_projects"
                editable={editable}
              />
              <FounderEditableTagList
                label="Financial"
                value={founder?.financial_goals}
                field="financial_goals"
                editable={editable}
              />
              <FounderEditableTagList
                label="Creative"
                value={founder?.creative_goals}
                field="creative_goals"
                editable={editable}
              />
              <FounderEditableTagList
                label="Health"
                value={founder?.health_goals}
                field="health_goals"
                editable={editable}
              />
              <FounderEditableTagList
                label="Travel"
                value={founder?.travel_goals}
                field="travel_goals"
                editable={editable}
              />
            </div>
          </ExpandableBlock>
        </Section>
      </div>

      {/* Avoid / dealbreakers */}
      <div className="mt-12">
        <Section
          eyebrow="Avoid & Dealbreakers"
          title="The shape of your no."
          description="What Jarvis filters out before you ever see it."
        >
          <FounderEditableTagList
            label="Avoid"
            value={founder?.avoid_keywords}
            field="avoid_keywords"
            editable={editable}
            muted
          />
          <FounderEditableTagList
            label="Dealbreakers"
            value={founder?.dealbreakers}
            field="dealbreakers"
            editable={editable}
            muted
          />
        </Section>
      </div>

      {/* Memory */}
      <div className="mt-12">
        <Section
          eyebrow="Memory"
          title="Patterns, not an archive."
          description="High-signal items Jarvis remembers. Curate ruthlessly."
        >
          <div className="flex flex-col gap-3">
            {memory.map((m) => (
              <MemoryItemCard key={m.id} item={m} editable={editable} />
            ))}
            {memory.length === 0 ? (
              <p className="font-serif text-[14px] italic text-warm-ivory/45">
                No memories yet.
              </p>
            ) : null}
            {editable ? <CreateMemoryItem /> : null}
          </div>
        </Section>
      </div>

      {/* Taste signals */}
      <div className="mt-12">
        <Section
          eyebrow="Taste Signals"
          title="What you’re teaching Jarvis."
          description="Behavioral signals, observed and weighted. Not interpretations."
        >
          <div>
            <h3 className="text-[10px] uppercase tracking-editorial text-warm-ivory/55">
              Positive
            </h3>
            <ul className="mt-2 flex flex-col">
              {positive.map((s) => (
                <TasteSignalRow key={s.id} signal={s} editable={editable} />
              ))}
              {positive.length === 0 ? (
                <li className="py-3 text-[13px] text-warm-ivory/35">
                  No positive signals yet.
                </li>
              ) : null}
            </ul>
          </div>
          <div className="mt-4">
            <h3 className="text-[10px] uppercase tracking-editorial text-warm-ivory/55">
              Negative
            </h3>
            <ul className="mt-2 flex flex-col">
              {negative.map((s) => (
                <TasteSignalRow key={s.id} signal={s} editable={editable} />
              ))}
              {negative.length === 0 ? (
                <li className="py-3 text-[13px] text-warm-ivory/35">
                  No negative signals yet.
                </li>
              ) : null}
            </ul>
          </div>
          {editable ? (
            <div className="mt-4">
              <CreateTasteSignal />
            </div>
          ) : null}
        </Section>
      </div>

      {/* Memory rules */}
      <div className="mt-12">
        <Section eyebrow="Memory Rules" title="How Jarvis remembers.">
          <div className="flex flex-col gap-4 font-serif text-[15px] italic leading-[1.6] text-warm-ivory/80">
            <p>
              Jarvis stores patterns, not an archive of your life. Memory is
              intentional, editable, and small by design.
            </p>
            <ul className="flex flex-col gap-3 pl-4">
              <li>
                — Durable principles are pinned by you. They guide every
                recommendation.
              </li>
              <li>
                — Behavioral signals are learned from your reactions over time.
                They sharpen, fade, or get removed.
              </li>
              <li>— Session context is temporary and decays on its own.</li>
              <li>
                — You can edit, archive, or delete anything here at any time.
              </li>
            </ul>
            <p>
              Jarvis is built to know your taste — and to occasionally stretch
              it. Expect a small percentage of recommendations to push into new
              territory on purpose.
            </p>
          </div>
        </Section>
      </div>

      <footer className="mt-16 flex items-center justify-between border-t border-divider/70 pt-6 text-[11px] uppercase tracking-editorial text-warm-ivory/45">
        <span>
          Signed in as {user.email}
          {!editable ? " · viewer" : null}
        </span>
        <form action={signOut}>
          <button
            type="submit"
            className="text-warm-ivory/55 transition-colors duration-300 ease-atmospheric hover:text-warm-ivory/85"
          >
            Sign out
          </button>
        </form>
      </footer>
    </div>
  );
}

function RoleBadge({ role }: { role: "owner" | "viewer" }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 border px-2 py-1 text-[10px] uppercase tracking-editorial " +
        (role === "owner"
          ? "border-muted-gold/50 text-muted-gold"
          : "border-divider text-warm-ivory/55")
      }
    >
      <span
        aria-hidden
        className={
          "h-1.5 w-1.5 rounded-full " +
          (role === "owner" ? "bg-muted-gold" : "bg-warm-ivory/40")
        }
      />
      {role}
    </span>
  );
}
