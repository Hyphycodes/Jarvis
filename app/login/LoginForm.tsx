"use client";

import { useState, useTransition } from "react";
import { sendMagicLink, type AuthErrorCode } from "@/lib/actions/auth";

const ERROR_COPY: Record<AuthErrorCode, string> = {
  invalid_email: "Enter a valid email.",
  rate_limited:
    "Too many login emails requested. Wait a few minutes before trying again.",
  send_failed: "Sign-in email couldn’t be sent. Try again shortly.",
};

type State =
  | { kind: "idle" }
  | { kind: "sent"; email: string }
  | { kind: "error"; message: string };

export function LoginForm({ next }: { next?: string }) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<State>({ kind: "idle" });

  function onSubmit(formData: FormData) {
    if (next) formData.set("next", next);
    startTransition(async () => {
      const result = await sendMagicLink(formData);
      if (result.ok) {
        setState({ kind: "sent", email: result.email });
      } else {
        setState({
          kind: "error",
          message: ERROR_COPY[result.code] ?? result.message,
        });
      }
    });
  }

  if (state.kind === "sent") {
    return (
      <section className="mt-10 flex flex-col gap-3">
        <span className="text-[11px] uppercase tracking-editorial text-muted-gold">
          Check your inbox
        </span>
        <p className="font-serif text-[18px] italic leading-[1.45] text-warm-ivory/85">
          A sign-in link is on its way to {state.email}.
        </p>
        <p className="text-[12px] leading-[1.55] text-warm-ivory/55">
          The link expires shortly. If it doesn’t work, request a new one — but
          wait a minute or two between attempts so the rate limit doesn’t kick
          in.
        </p>
        <button
          type="button"
          onClick={() => setState({ kind: "idle" })}
          className="self-start text-[11px] uppercase tracking-editorial text-warm-ivory/55 transition-colors duration-300 ease-atmospheric hover:text-warm-ivory/85"
        >
          Use a different email
        </button>
      </section>
    );
  }

  return (
    <form action={onSubmit} className="mt-10 flex flex-col gap-5">
      <label className="flex flex-col gap-2">
        <span className="text-[11px] uppercase tracking-editorial text-warm-ivory/55">
          Email
        </span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={pending}
          className="border-b border-divider bg-transparent py-3 font-serif text-[18px] text-warm-ivory placeholder-warm-ivory/30 outline-none transition-colors duration-300 ease-atmospheric focus:border-muted-gold/70"
          placeholder="you@quiet.com"
        />
      </label>

      {state.kind === "error" ? (
        <p
          role="alert"
          className="border-l-2 border-muted-gold/60 bg-soft-black/60 px-3 py-2 text-[12px] leading-[1.5] text-warm-ivory/85"
        >
          {state.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 self-stretch bg-warm-ivory px-6 py-4 text-[12px] uppercase tracking-editorial text-near-black transition-opacity duration-300 ease-atmospheric disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send sign-in link"}
      </button>
    </form>
  );
}
