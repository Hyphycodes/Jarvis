import { LoginForm } from "./LoginForm";

export const metadata = {
  title: "Sign in · Jarvis",
};

export default function LoginPage() {
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
          Quiet entrance.
        </h1>
        <p className="max-w-[36ch] font-serif text-[16px] italic leading-[1.45] text-warm-ivory/70">
          A private door. We&rsquo;ll send a single-use link to your inbox.
        </p>
        <div className="mt-1 h-px w-8 bg-muted-gold/50" />
      </header>

      <LoginForm />

      <footer className="mt-auto pt-12 text-[12px] leading-[1.55] text-warm-ivory/50">
        By signing in you accept that Jarvis is a private tool. No accounts are
        sold. No data is shared.
      </footer>
    </div>
  );
}
