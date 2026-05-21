"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  sendMagicLink,
  signInWithPassword,
  signUpWithPassword,
  type AuthErrorCode,
} from "@/lib/actions/auth";

const ERROR_COPY: Record<AuthErrorCode, string> = {
  invalid_input: "Check the email and password.",
  invalid_credentials: "That email and password don’t match. Try again.",
  rate_limited:
    "Too many attempts. Wait a few minutes before trying again.",
  needs_confirmation:
    "Check your inbox to confirm the account before signing in.",
  send_failed: "Something went wrong. Try again shortly.",
};

type Mode = "link" | "password";
type PasswordKind = "signin" | "signup";

type LinkState =
  | { kind: "idle" }
  | { kind: "sent"; email: string }
  | { kind: "error"; message: string };

type PasswordState =
  | { kind: "idle" }
  | { kind: "needs_confirmation"; email: string }
  | { kind: "error"; message: string };

export function LoginForm({ next }: { next?: string }) {
  const [mode, setMode] = useState<Mode>("link");
  return (
    <section className="mt-10 flex flex-col gap-6">
      <ModeToggle mode={mode} onChange={setMode} />
      {mode === "link" ? (
        <MagicLinkForm next={next} />
      ) : (
        <PasswordForm next={next} />
      )}
    </section>
  );
}

function ModeToggle({
  mode,
  onChange,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
}) {
  return (
    <div className="flex items-center gap-6 border-b border-divider/70">
      <ModeTab
        active={mode === "link"}
        onClick={() => onChange("link")}
        label="Magic Link"
      />
      <ModeTab
        active={mode === "password"}
        onClick={() => onChange("password")}
        label="Password"
      />
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "relative -mb-px pb-2 text-[11px] uppercase tracking-editorial transition-colors duration-300 ease-atmospheric " +
        (active ? "text-warm-ivory" : "text-warm-ivory/40 hover:text-warm-ivory/70")
      }
    >
      {label}
      {active ? (
        <span
          aria-hidden
          className="absolute -bottom-px left-0 h-[2px] w-full bg-muted-gold"
        />
      ) : null}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Magic link
// ---------------------------------------------------------------------------
function MagicLinkForm({ next }: { next?: string }) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<LinkState>({ kind: "idle" });

  function onSubmit(formData: FormData) {
    if (next) formData.set("next", next);
    startTransition(async () => {
      const result = await sendMagicLink(formData);
      if (result.ok) setState({ kind: "sent", email: result.email });
      else
        setState({
          kind: "error",
          message: ERROR_COPY[result.code] ?? result.message,
        });
    });
  }

  if (state.kind === "sent") {
    return (
      <div className="flex flex-col gap-3">
        <span className="text-[11px] uppercase tracking-editorial text-muted-gold">
          Check your inbox
        </span>
        <p className="font-serif text-[17px] italic leading-[1.45] text-warm-ivory/85">
          A sign-in link is on its way to {state.email}.
        </p>
        <p className="text-[12px] leading-[1.55] text-warm-ivory/55">
          The link expires shortly. Wait a minute between requests so the rate
          limit doesn’t kick in.
        </p>
        <button
          type="button"
          onClick={() => setState({ kind: "idle" })}
          className="self-start pt-1 text-[11px] uppercase tracking-editorial text-warm-ivory/55 hover:text-warm-ivory/85"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-5">
      <Field label="Email" name="email" type="email" required disabled={pending} />
      {state.kind === "error" ? <ErrorNote>{state.message}</ErrorNote> : null}
      <PrimaryButton pending={pending} label="Send sign-in link" />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Password (sign-in + sign-up toggle)
// ---------------------------------------------------------------------------
function PasswordForm({ next }: { next?: string }) {
  const router = useRouter();
  const [kind, setKind] = useState<PasswordKind>("signin");
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<PasswordState>({ kind: "idle" });

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const action =
        kind === "signin" ? signInWithPassword : signUpWithPassword;
      const result = await action(formData);
      if (!result.ok) {
        setState({
          kind: "error",
          message: ERROR_COPY[result.code] ?? result.message,
        });
        return;
      }
      if (result.signedIn) {
        // Cookies are set by the server action; refresh to pick up the session.
        router.refresh();
        router.push(next ?? "/settings");
      } else {
        // Sign-up requiring email confirmation.
        setState({ kind: "needs_confirmation", email: result.email });
      }
    });
  }

  if (state.kind === "needs_confirmation") {
    return (
      <div className="flex flex-col gap-3">
        <span className="text-[11px] uppercase tracking-editorial text-muted-gold">
          One more step
        </span>
        <p className="font-serif text-[17px] italic leading-[1.45] text-warm-ivory/85">
          We sent a confirmation link to {state.email}. Open it to finish
          setting up the account.
        </p>
        <button
          type="button"
          onClick={() => setState({ kind: "idle" })}
          className="self-start pt-1 text-[11px] uppercase tracking-editorial text-warm-ivory/55 hover:text-warm-ivory/85"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-5">
      <div className="flex items-center gap-4 text-[11px] uppercase tracking-editorial">
        <KindTab
          active={kind === "signin"}
          label="Sign in"
          onClick={() => setKind("signin")}
        />
        <span aria-hidden className="text-warm-ivory/25">
          ·
        </span>
        <KindTab
          active={kind === "signup"}
          label="Create account"
          onClick={() => setKind("signup")}
        />
      </div>
      <Field label="Email" name="email" type="email" required disabled={pending} />
      <Field
        label="Password"
        name="password"
        type="password"
        required
        disabled={pending}
        autoComplete={kind === "signin" ? "current-password" : "new-password"}
      />
      {state.kind === "error" ? <ErrorNote>{state.message}</ErrorNote> : null}
      <PrimaryButton
        pending={pending}
        label={kind === "signin" ? "Sign in" : "Create account"}
      />
    </form>
  );
}

function KindTab({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "text-warm-ivory"
          : "text-warm-ivory/40 hover:text-warm-ivory/70"
      }
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Small bits
// ---------------------------------------------------------------------------
function Field({
  label,
  name,
  type,
  required,
  disabled,
  autoComplete,
}: {
  label: string;
  name: string;
  type: "email" | "password";
  required?: boolean;
  disabled?: boolean;
  autoComplete?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] uppercase tracking-editorial text-warm-ivory/55">
        {label}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        disabled={disabled}
        autoComplete={autoComplete ?? (type === "email" ? "email" : undefined)}
        className="border-b border-divider bg-transparent py-2.5 font-serif text-[17px] text-warm-ivory placeholder-warm-ivory/30 outline-none transition-colors duration-300 ease-atmospheric focus:border-muted-gold/70"
      />
    </label>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="border-l-2 border-muted-gold/60 bg-soft-black/60 px-3 py-2 text-[12px] leading-[1.5] text-warm-ivory/85"
    >
      {children}
    </p>
  );
}

function PrimaryButton({
  pending,
  label,
}: {
  pending: boolean;
  label: string;
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-1 bg-warm-ivory px-5 py-3.5 text-[12px] uppercase tracking-editorial text-near-black transition-opacity duration-300 ease-atmospheric disabled:opacity-50"
    >
      {pending ? "Working…" : label}
    </button>
  );
}
