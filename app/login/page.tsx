import Link from "next/link";
import { LoginForm } from "./LoginForm";
import { getSessionUser } from "@/lib/auth";
import { signOut } from "@/lib/actions/auth";

export const metadata = {
  title: "Sign in · Jarvis",
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  error?: string;
  message?: string;
  next?: string;
}>;

const ERROR_COPY: Record<string, string> = {
  callback_failed:
    "We couldn’t complete sign-in. Request a fresh link and try again.",
  callback_no_code:
    "That sign-in link was incomplete. Request a new one.",
  link_expired:
    "That sign-in link has expired. Magic links are short-lived — request a new one.",
  link_invalid:
    "That sign-in link is no longer valid. Request a new one.",
  rate_limited:
    "Too many login emails requested. Wait a few minutes before trying again.",
  invalid_email: "Enter a valid email.",
  send_failed: "Sign-in email couldn’t be sent. Try again shortly.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const user = await getSessionUser();
  const errorMessage = params.error
    ? ERROR_COPY[params.error] ?? params.message ?? "Sign-in didn’t complete."
    : null;

  return (
    <div
      className="mx-auto flex min-h-[100dvh] w-full max-w-[440px] flex-col bg-near-black px-6 text-warm-ivory"
      style={{
        paddingTop: "calc(env(safe-area-inset-top) + 64px)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 32px)",
      }}
    >
      <header className="flex flex-col gap-3">
        <span className="text-[11px] uppercase tracking-editorial text-muted-gold">
          Jarvis
        </span>
        <h1 className="font-serif text-[44px] italic leading-[1.05] tracking-[-0.01em] text-warm-ivory">
          {user ? "Already inside." : "Quiet entrance."}
        </h1>
        <p className="max-w-[36ch] font-serif text-[16px] italic leading-[1.45] text-warm-ivory/70">
          {user
            ? "Your session is active. Head to your profile or settings."
            : "A private door. We’ll send a single-use link to your inbox."}
        </p>
        <div className="mt-1 h-px w-8 bg-muted-gold/50" />
      </header>

      {errorMessage && !user ? (
        <div
          role="alert"
          className="mt-8 border-l-2 border-muted-gold/60 bg-soft-black/60 px-4 py-3 text-[13px] leading-[1.5] text-warm-ivory/85"
        >
          {errorMessage}
        </div>
      ) : null}

      {user ? (
        <section className="mt-10 flex flex-col gap-5">
          <div className="border border-divider px-4 py-4">
            <div className="text-[10px] uppercase tracking-editorial text-muted-gold">
              Signed in
            </div>
            <div className="mt-1 font-serif text-[18px] italic leading-tight text-warm-ivory">
              {user.email ?? "Your account"}
            </div>
            <div className="mt-1 text-[11px] uppercase tracking-editorial text-warm-ivory/55">
              Role · {user.role}
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <Link
              href="/profile"
              className="block bg-warm-ivory px-6 py-4 text-center text-[12px] uppercase tracking-editorial text-near-black"
            >
              Go to profile
            </Link>
            <Link
              href="/settings"
              className="block border border-divider px-6 py-4 text-center text-[12px] uppercase tracking-editorial text-warm-ivory/85"
            >
              Settings
            </Link>
            <form action={signOut}>
              <button
                type="submit"
                className="w-full px-6 py-3 text-center text-[11px] uppercase tracking-editorial text-warm-ivory/55 transition-colors duration-300 ease-atmospheric hover:text-warm-ivory/85"
              >
                Sign out
              </button>
            </form>
          </div>
        </section>
      ) : (
        <LoginForm next={params.next} />
      )}

      <footer className="mt-auto pt-12 text-[12px] leading-[1.55] text-warm-ivory/50">
        Jarvis is a private tool. No accounts are sold. No data is shared.
      </footer>
    </div>
  );
}
