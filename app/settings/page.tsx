import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { BackButton, MotionPage } from "@/components";
import { SettingsScreen } from "./SettingsScreen";

export const metadata = { title: "Settings · Jarvis" };
export const dynamic = "force-dynamic";

const APP_VERSION = "0.1.0";

export default async function SettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/settings");

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
            <BackButton fallbackHref="/" />
            <span className="lux-label">Settings</span>
          </div>
          <h1 className="mt-6 font-serif text-[42px] italic leading-[1.02] text-warm-ivory">
            Settings.
          </h1>
          <p className="mt-3 max-w-[38ch] font-serif text-[16px] italic leading-[1.45] text-warm-ivory/65">
            How JARVIS knows you, speaks to you, and protects your layer.
          </p>
          <div className="mt-5 h-px w-10 bg-muted-gold/50" />
        </header>

        <SettingsScreen
          email={user.email}
          displayName={user.display_name}
          homeCity={user.home_city}
          canEdit={user.role === "owner"}
          version={APP_VERSION}
        />
      </MotionPage>
    </main>
  );
}
