"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      onClick={() => startTransition(() => router.refresh())}
      disabled={pending}
      className="block border border-divider px-4 py-3 text-center text-[11px] uppercase tracking-editorial text-warm-ivory/85 transition-colors duration-300 ease-atmospheric hover:border-warm-ivory/40 disabled:opacity-50"
    >
      {pending ? "Refreshing…" : "Recheck status"}
    </button>
  );
}

export function ShowOrigin() {
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);
  if (!origin) {
    return <span className="text-[13px] text-warm-ivory/45">…</span>;
  }
  return <span className="break-all text-[13px] text-warm-ivory/85">{origin}</span>;
}
