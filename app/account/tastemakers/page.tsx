"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BackButton } from "@/components";
import { AddTastemakerForm, TastemakerRowActions } from "./client-bits";
import type { TastemakerRow } from "@/lib/types/database";

export default function TastemakersPage() {
  const [tastemakers, setTastemakers] = useState<TastemakerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTastemakers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tastemakers");
      if (!res.ok) throw new Error("Failed to load tastemakers");
      const data = (await res.json()) as { tastemakers: TastemakerRow[] };
      setTastemakers(data.tastemakers ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTastemakers();
  }, [fetchTastemakers]);

  return (
    <main
      className="lux-page smooth-page mx-auto min-h-[100dvh] w-full max-w-[680px] overflow-x-hidden px-6 text-warm-ivory"
      style={{
        paddingTop: "calc(env(safe-area-inset-top) + 32px)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 48px)",
      }}
    >
      <header className="flex items-center justify-between">
        <BackButton fallbackHref="/account" />
        <span className="lux-label">Tastemakers</span>
        <span className="w-16" aria-hidden />
      </header>

      <section className="mt-6">
        <h1 className="font-serif text-[44px] italic leading-[1.05] tracking-[-0.005em] text-warm-ivory">
          Tastemakers
        </h1>
        <p className="mt-2 max-w-[40ch] text-[14px] leading-[1.55] text-warm-ivory/55">
          The people whose bookings, dinners, and events are worth tracking.
          Jarvis checks their pages weekly.
        </p>
      </section>

      <AddTastemakerForm onAdded={fetchTastemakers} />

      <section className="mt-8">
        {loading ? (
          <div className="py-12 text-center text-[13px] text-warm-ivory/35">
            Loading…
          </div>
        ) : error ? (
          <div className="py-12 text-center text-[13px] text-[#E07A6E]">
            {error}
          </div>
        ) : tastemakers.length === 0 ? (
          <div className="py-12 text-center text-[13px] text-warm-ivory/35">
            No tastemakers yet. Add the first one above.
          </div>
        ) : (
          <div className="flex flex-col">
            {tastemakers.map((tm, i) => (
              <TastemakerCard
                key={tm.id}
                tastemaker={tm}
                last={i === tastemakers.length - 1}
                onChanged={fetchTastemakers}
              />
            ))}
          </div>
        )}
      </section>

      {tastemakers.length > 0 ? (
        <div className="mt-8 text-center">
          <Link
            href="/api/tastemakers/sweep"
            className="text-[12px] text-warm-ivory/35 hover:text-warm-ivory/60"
          >
            Next sweep: Wednesday 6 AM CT
          </Link>
        </div>
      ) : null}
    </main>
  );
}

function TastemakerCard({
  tastemaker,
  last,
  onChanged,
}: {
  tastemaker: TastemakerRow;
  last: boolean;
  onChanged: () => void;
}) {
  const lastChecked = tastemaker.last_checked_at
    ? new Date(tastemaker.last_checked_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : null;

  const urls = [
    tastemaker.ra_url && { label: "RA", url: tastemaker.ra_url },
    tastemaker.website_url && { label: "Web", url: tastemaker.website_url },
    tastemaker.newsletter_url && { label: "Newsletter", url: tastemaker.newsletter_url },
    tastemaker.linktree_url && { label: "Linktree", url: tastemaker.linktree_url },
    tastemaker.soundcloud_url && { label: "SoundCloud", url: tastemaker.soundcloud_url },
  ].filter(Boolean) as Array<{ label: string; url: string }>;

  return (
    <div
      className={`py-5 ${last ? "" : "border-b border-[rgba(246,239,221,0.06)]"}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="font-serif text-[20px] text-warm-ivory">
              {tastemaker.name}
            </span>
            {tastemaker.role ? (
              <span className="text-[11px] capitalize text-warm-ivory/40">
                {tastemaker.role.replace(/_/g, " ")}
              </span>
            ) : null}
          </div>
          {tastemaker.notes ? (
            <p className="mt-1 text-[13px] leading-[1.45] text-warm-ivory/52">
              {tastemaker.notes}
            </p>
          ) : null}
          {tastemaker.instagram_handle ? (
            <p className="mt-1 text-[12px] text-warm-ivory/30">
              @{tastemaker.instagram_handle.replace(/^@/, "")}
            </p>
          ) : null}
          {urls.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {urls.map(({ label, url }) => (
                <a
                  key={label}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-sm border border-white/[0.07] px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-warm-ivory/45 transition-colors hover:text-warm-ivory/70"
                >
                  {label}
                </a>
              ))}
            </div>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          {lastChecked ? (
            <span className="text-[11px] text-warm-ivory/30">
              Checked {lastChecked}
            </span>
          ) : (
            <span className="text-[11px] text-warm-ivory/20">Not yet checked</span>
          )}
        </div>
      </div>
      <TastemakerRowActions tastemaker={tastemaker} onChanged={onChanged} />
    </div>
  );
}
