"use client";

import Link from "next/link";
import {
  AppFrame,
  Orbit,
  SectionLabel,
  type OrbitNode,
} from "@/components";
import { Chevron } from "@/components/icons";
import type { CirclePerson, CircleUpdate } from "@/lib/ai/types";

/**
 * Sprint 5 — Circle realigned to OG reference and wired to real data.
 *
 * Reads from `loadCircleSurface()` via app/(tabs)/layout.tsx. No more
 * hardcoded ORBIT_NODES / UPDATES. No filter row (the OG has none and the
 * previous filter was decorative — it never actually filtered anything).
 */

type CirclePayload = {
  people: CirclePerson[];
  updates: CircleUpdate[];
};

export function CircleSigned({ payload }: { payload?: CirclePayload }) {
  const people = payload?.people ?? [];
  const updates = payload?.updates ?? [];

  const orbitNodes = buildOrbitNodes(people);
  const peopleById = new Map(people.map((p) => [p.id, p]));

  return (
    <AppFrame>
      <header className="flex flex-col gap-3 pt-6">
        <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-4">
          <h1 className="font-serif text-[52px] italic leading-[1.02] tracking-[-0.005em] text-warm-ivory">
            Circle
          </h1>
          <span className="self-start pt-[8px] text-[11px] uppercase tracking-[0.16em] text-warm-ivory/55">
            {formatToday()}
          </span>
        </div>
        <p className="max-w-[42ch] text-[15px] leading-[1.55] text-warm-ivory/62">
          Your inner circle. Key relationships
          <br />
          and recent context.
        </p>
        <div className="h-px w-8 bg-muted-gold/30" />
      </header>

      <div className="mt-8">
        {orbitNodes.length > 0 ? (
          <Orbit
            size={360}
            center={<JMonogram />}
            nodes={orbitNodes}
          />
        ) : (
          <div className="flex h-[200px] items-center justify-center text-center font-serif italic text-[20px] text-warm-ivory/45">
            Your circle is quiet right now.
          </div>
        )}

        {people.length > 8 ? (
          <div className="mt-2 flex justify-center">
            <a
              href="/account/history"
              className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.2em] text-warm-ivory/55 transition-colors duration-300 ease-atmospheric hover:text-warm-ivory/80"
            >
              View All <span aria-hidden>→</span>
            </a>
          </div>
        ) : null}
      </div>

      {people.length > 0 ? (
        <section className="mt-10 flex flex-col">
          <SectionLabel>People</SectionLabel>
          <ul className="lux-surface mt-4 flex flex-col overflow-hidden rounded-[var(--radius-card)]">
            {people.slice(0, 12).map((p, i) => (
              <li key={p.id}>
                <Link
                  href={`/person/${p.id}`}
                  className={
                    "flex items-center justify-between gap-3 px-4 py-3.5 transition-colors duration-300 ease-atmospheric hover:bg-white/[0.015] " +
                    (i !== Math.min(people.length, 12) - 1 ? "border-b border-white/[0.055]" : "")
                  }
                >
                  <div className="min-w-0">
                    <div className="truncate font-serif text-[17px] italic leading-tight text-warm-ivory">
                      {p.name}
                    </div>
                    {p.role ? (
                      <div className="mt-0.5 truncate text-[10px] uppercase tracking-[0.18em] text-muted-gold/75">
                        {p.role}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-warm-ivory/40">
                    {formatRecency(p.lastSeenAt ?? p.lastInteraction) ?? ""}
                    <Chevron direction="right" size={12} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-10 flex flex-col">
        <SectionLabel>Updates</SectionLabel>
        {updates.length > 0 ? (
          <ul className="lux-surface mt-4 flex flex-col overflow-hidden rounded-[var(--radius-card)]">
            {updates.map((u, i) => (
              <UpdateRow
                key={u.id}
                update={u}
                person={peopleById.get(u.personId)}
                divider={i !== updates.length - 1}
              />
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-[13px] leading-[1.5] text-warm-ivory/50">
            No recent updates from your circle.
          </p>
        )}

        <button
          type="button"
          className="mt-5 flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-warm-ivory/55 transition-opacity duration-300 ease-atmospheric hover:text-warm-ivory/80"
        >
          <span>Add Note</span>
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/[0.1] text-base leading-none text-warm-ivory/70">
            +
          </span>
        </button>
      </section>
    </AppFrame>
  );
}

// ── Orbit node builder ──────────────────────────────────────────────────────

/**
 * Convert real CirclePerson[] into deterministic OrbitNode positions.
 *
 * Up to 8 nodes shown. Sort by closenessScore desc. The highest-closeness
 * person goes top (12 o'clock); the rest distribute around the ring
 * clockwise. Inner ring (size 60, no fade) for closeness >= 0.5; outer
 * ring (size 44, fade) for the rest.
 */
function buildOrbitNodes(people: CirclePerson[]): OrbitNode[] {
  if (people.length === 0) return [];
  const sorted = [...people]
    .sort((a, b) => b.closenessScore - a.closenessScore)
    .slice(0, 8);
  const count = sorted.length;

  return sorted.map((person, idx) => {
    // Distribute evenly around the circle starting at top (-π/2).
    const angle = (-Math.PI / 2) + (idx * (Math.PI * 2)) / count;
    const isInner = person.closenessScore >= 0.5;
    const radius = isInner ? 0.78 : 1.05;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    return {
      id: person.id,
      name: person.name,
      role: person.role,
      recency: formatRecency(person.lastInteraction),
      x,
      y,
      faded: person.closenessScore < 0.4,
      size: isInner ? 60 : 44,
    };
  });
}

function JMonogram() {
  return (
    <div
      className="flex items-center justify-center rounded-full border border-muted-gold/70"
      style={{
        width: 84,
        height: 84,
        background:
          "radial-gradient(circle at 50% 40%, #1c1c1f 0%, #0a0a0b 80%)",
        boxShadow: "0 0 24px rgba(184,146,74,0.18)",
      }}
    >
      <span className="font-serif text-[26px] italic leading-none text-warm-ivory">
        J.
      </span>
    </div>
  );
}

// ── Update row ──────────────────────────────────────────────────────────────

function UpdateRow({
  update,
  person,
  divider,
}: {
  update: CircleUpdate;
  person?: CirclePerson;
  divider: boolean;
}) {
  const name = person?.name ?? update.title ?? "Update";
  const role = person?.role;
  const date = formatShortDate(update.createdAt);

  return (
    <li
      className={
        "grid grid-cols-[44px_minmax(0,1fr)_auto] items-start gap-3 px-4 py-4 " +
        (divider ? "border-b border-white/[0.055]" : "")
      }
    >
      <div
        aria-hidden
        className="h-11 w-11 rounded-full border border-muted-gold/55"
        style={{
          background:
            "radial-gradient(ellipse at 50% 35%, rgba(246,239,221,0.12) 0%, #141411 70%, #090908 100%)",
        }}
      />
      <div className="min-w-0">
        <div className="font-serif text-[17px] italic leading-tight text-warm-ivory">
          {name}
        </div>
        {role ? (
          <div className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-muted-gold/85">
            {role}
          </div>
        ) : null}
        <p className="mt-2 text-[14px] leading-[1.45] text-warm-ivory/68">
          {update.summary}
        </p>
        {update.suggestedAction ? (
          <p className="mt-1 text-[12px] leading-[1.4] text-warm-ivory/45">
            {update.suggestedAction}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2 pt-1 text-[11px] uppercase tracking-[0.18em] text-warm-ivory/45">
        {date}
        <Chevron direction="right" size={12} />
      </div>
    </li>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatRecency(iso?: string): string | undefined {
  if (!iso) return undefined;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return undefined;
    const diff = Date.now() - d.getTime();
    const days = Math.max(0, Math.floor(diff / (24 * 60 * 60 * 1000)));
    if (days === 0) return "today";
    if (days === 1) return "1d";
    if (days < 14) return `${days}d`;
    const weeks = Math.floor(days / 7);
    if (weeks < 8) return `${weeks}w`;
    const months = Math.floor(days / 30);
    return `${months}m`;
  } catch {
    return undefined;
  }
}

function formatShortDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d
      .toLocaleDateString("en-US", { month: "short", day: "numeric" })
      .toUpperCase();
  } catch {
    return "";
  }
}

function formatToday(): string {
  return new Date()
    .toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
    .toUpperCase();
}
