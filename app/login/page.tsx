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
  callback_no_code: "That sign-in link was incomplete. Request a new one.",
  link_expired:
    "That sign-in link has expired. Magic links are short-lived — request a new one.",
  link_invalid:
    "That sign-in link is no longer valid. Request a new one.",
  rate_limited:
    "Too many login emails requested. Wait a few minutes before trying again.",
  invalid_input: "Check the email or password and try again.",
  invalid_credentials:
    "That email and password don’t match. Try again.",
  send_failed: "Sign-in email couldn’t be sent. Try again shortly.",
  needs_confirmation:
    "Check your inbox to confirm the account before signing in.",
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
        paddingTop: "calc(env(safe-area-inset-top) + 48px)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 32px)",
      }}
    >
      <header className="flex flex-col gap-3">
        <span className="text-[11px] uppercase tracking-editorial text-muted-gold">
          Jarvis
        </span>
        <h1 className="font-serif text-[38px] italic leading-[1.05] tracking-[-0.01em] text-warm-ivory">
          {user ? "Already inside." : "Quiet entrance."}
        </h1>
        <p className="max-w-[36ch] font-serif text-[15px] italic leading-[1.5] text-warm-ivory/65">
          {user
            ? "Your session is active. Head wherever you need."
            : "A private door. Magic link or password — your choice."}
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
            <div className="mt-1 font-serif text-[17px] italic leading-tight text-warm-ivory">
              {user.email ?? "Your account"}
            </div>
            <div className="mt-1 text-[11px] uppercase tracking-editorial text-warm-ivory/55">
              Role · {user.role}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/"
              className="block bg-warm-ivory px-5 py-3.5 text-center text-[12px] uppercase tracking-editorial text-near-black"
            >
              Today
            </Link>
            <Link
              href="/profile"
              className="block border border-divider px-5 py-3.5 text-center text-[12px] uppercase tracking-editorial text-warm-ivory/85"
            >
              Profile
            </Link>
            <Link
              href="/settings"
              className="block border border-divider px-5 py-3.5 text-center text-[12px] uppercase tracking-editorial text-warm-ivory/85"
            >
              Settings
            </Link>
            <form action={signOut}>
              <button
                type="submit"
                className="w-full border border-muted-gold/40 px-5 py-3.5 text-[12px] uppercase tracking-editorial text-muted-gold transition-colors duration-300 ease-atmospheric hover:border-muted-gold"
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
