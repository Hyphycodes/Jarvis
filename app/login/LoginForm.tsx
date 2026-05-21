"use client";

import { useState, useTransition } from "react";
import { sendMagicLink } from "@/lib/actions/auth";

export function LoginForm() {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "sent"; email: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await sendMagicLink(formData);
      if (result.ok) setState({ kind: "sent", email: result.email });
      else setState({ kind: "error", message: result.error });
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
        <p className="text-[12px] text-muted-gold/90">{state.message}</p>
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
