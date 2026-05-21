"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Chevron } from "@/components/icons";

const GUEST_KEY = "jarvis.guest";

function readGuest(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(GUEST_KEY) === "1";
  } catch {
    return false;
  }
}

function writeGuest(value: boolean) {
  try {
    if (value) window.localStorage.setItem(GUEST_KEY, "1");
    else window.localStorage.removeItem(GUEST_KEY);
  } catch {
    // ignore
  }
}

type PromptItem = { label: string; icon: React.ReactNode };

export function GuestActions({ prompts }: { prompts: PromptItem[] }) {
  const [guest, setGuest] = useState<boolean | null>(null);

  useEffect(() => {
    setGuest(readGuest());
  }, []);

  // Until hydrated, render the auth-prompt variant. That's the larger,
  // more-content variant — switching to the guest variant after hydration
  // only ever removes content, so layout shift is minimal.
  const showLoginCluster = guest !== true;

  return (
    <div className="flex flex-col gap-5">
      {showLoginCluster ? (
        <div className="flex flex-col items-center gap-3">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-full border border-muted-gold/55 px-5 py-2.5 text-[12px] uppercase tracking-editorial text-muted-gold transition-colors duration-300 ease-atmospheric hover:border-muted-gold hover:text-soft-gold"
          >
            <UserIcon />
            Log in to save your insights
          </Link>
          <div className="flex flex-col items-center gap-1 text-[11px] uppercase tracking-editorial text-warm-ivory/40">
            or
            <button
              type="button"
              onClick={() => {
                writeGuest(true);
                setGuest(true);
              }}
              className="text-muted-gold transition-colors duration-300 ease-atmospheric hover:text-soft-gold"
            >
              Continue as guest
            </button>
          </div>
        </div>
      ) : null}

      <ul className="mt-1 flex flex-col gap-2">
        {prompts.map((p) => (
          <li key={p.label}>
            <Link
              href="/login"
              className="flex items-center justify-between gap-3 rounded-md border border-divider/60 px-4 py-3 text-left text-[13px] text-warm-ivory/85 transition-colors duration-300 ease-atmospheric hover:border-divider hover:bg-soft-black/40"
            >
              <span className="flex items-center gap-3">
                <span className="text-muted-gold/85">{p.icon}</span>
                {p.label}
              </span>
              <Chevron direction="right" size={14} className="text-warm-ivory/40" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function UserIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  );
}
