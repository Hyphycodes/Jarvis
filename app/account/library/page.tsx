import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { BackButton, MotionPage } from "@/components";
import type { PlacesLibraryRow } from "@/lib/types/database";

export const metadata = { title: "Places Library · Account" };
export const dynamic = "force-dynamic";

const PLACE_TYPES = [
  "restaurant",
  "bar",
  "lounge",
  "venue",
  "shop",
  "hotel",
  "cultural",
  "ritual",
  "outdoor",
] as const;

type PlaceType = (typeof PLACE_TYPES)[number];

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/account/library");

  const params = await searchParams;
  const filterType = params.type as PlaceType | undefined;
  const page = parseInt(params.page ?? "1", 10);
  const PAGE_SIZE = 50;

  const supabase = await getServerSupabase();

  let query = supabase
    .from("places_library")
    .select("*")
    .eq("user_id", user.id)
    .order("last_researched_at", { ascending: false });

  if (filterType && PLACE_TYPES.includes(filterType)) {
    query = query.eq("place_type", filterType);
  }

  const { data, count } = await query
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
    .limit(PAGE_SIZE);

  const entries = (data ?? []) as PlacesLibraryRow[];
  const totalCount = count ?? entries.length;

  // Group by place_type
  const grouped: Partial<Record<PlaceType, PlacesLibraryRow[]>> = {};
  for (const entry of entries) {
    const t = (entry.place_type ?? "restaurant") as PlaceType;
    if (!grouped[t]) grouped[t] = [];
    grouped[t]!.push(entry);
  }

  const groupOrder = filterType
    ? [filterType]
    : (PLACE_TYPES.filter((t) => grouped[t]?.length) as PlaceType[]);

  return (
    <main
      className="lux-page smooth-page mx-auto min-h-[100dvh] w-full max-w-[680px] overflow-x-hidden px-6 text-warm-ivory"
      style={{
        paddingTop: "calc(env(safe-area-inset-top) + 32px)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 48px)",
      }}
    >
      <MotionPage>
        <header className="flex items-center justify-between">
          <BackButton fallbackHref="/account" />
          <span className="lux-label">Library</span>
          <span className="w-16" aria-hidden />
        </header>

        <section className="mt-6">
          <h1 className="font-serif text-[44px] italic leading-[1.05] tracking-[-0.005em] text-warm-ivory">
            Places Library
          </h1>
          <p className="mt-2 text-[14px] text-warm-ivory/55">
            {totalCount} place{totalCount !== 1 ? "s" : ""} known
            {filterType ? ` · filtered by ${filterType}` : ""}
          </p>
        </section>

        {/* Filter tabs */}
        <div className="mt-6 flex flex-wrap gap-2">
          <FilterChip href="/account/library" active={!filterType} label="All" />
          {PLACE_TYPES.map((t) =>
            grouped[t]?.length ? (
              <FilterChip
                key={t}
                href={`/account/library?type=${t}`}
                active={filterType === t}
                label={t}
                count={grouped[t]!.length}
              />
            ) : null,
          )}
        </div>

        {/* Grouped entries */}
        {entries.length === 0 ? (
          <div className="mt-16 text-center text-[14px] text-warm-ivory/40">
            No places yet. The Scout will find some tonight.
          </div>
        ) : (
          <div className="mt-8 flex flex-col gap-10">
            {groupOrder.map((type) => {
              const group = grouped[type] ?? [];
              if (!group.length) return null;
              return (
                <section key={type}>
                  <div className="lux-label mb-4 capitalize">{type}</div>
                  <div className="flex flex-col">
                    {group.map((entry, i) => (
                      <LibraryEntryRow
                        key={entry.id}
                        entry={entry}
                        last={i === group.length - 1}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalCount > PAGE_SIZE ? (
          <div className="mt-8 flex items-center justify-between">
            {page > 1 ? (
              <Link
                href={`/account/library?${filterType ? `type=${filterType}&` : ""}page=${page - 1}`}
                className="text-[13px] text-warm-ivory/55 hover:text-warm-ivory/80"
              >
                ← Previous
              </Link>
            ) : (
              <span />
            )}
            <span className="text-[12px] text-warm-ivory/35">
              Page {page} of {Math.ceil(totalCount / PAGE_SIZE)}
            </span>
            {page * PAGE_SIZE < totalCount ? (
              <Link
                href={`/account/library?${filterType ? `type=${filterType}&` : ""}page=${page + 1}`}
                className="text-[13px] text-warm-ivory/55 hover:text-warm-ivory/80"
              >
                Next →
              </Link>
            ) : (
              <span />
            )}
          </div>
        ) : null}
      </MotionPage>
    </main>
  );
}

function FilterChip({
  href,
  active,
  label,
  count,
}: {
  href: string;
  active: boolean;
  label: string;
  count?: number;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.16em] transition-colors ${
        active
          ? "border-muted-gold/60 text-muted-gold"
          : "border-white/[0.08] text-warm-ivory/45 hover:text-warm-ivory/65"
      }`}
    >
      {label}
      {count != null ? (
        <span className="opacity-60">{count}</span>
      ) : null}
    </Link>
  );
}

function LibraryEntryRow({
  entry,
  last,
}: {
  entry: PlacesLibraryRow;
  last: boolean;
}) {
  const verdict = entry.verdict ?? "No verdict yet.";
  const truncatedVerdict =
    verdict.length > 80 ? verdict.slice(0, 77) + "…" : verdict;

  const strengthPct = Math.round((entry.verdict_strength ?? 0) * 100);

  return (
    <Link
      href={`/account/library/${entry.slug}`}
      className={`flex items-start gap-4 py-4 transition-colors hover:bg-white/[0.014] ${
        last ? "" : "border-b border-[rgba(246,239,221,0.06)]"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-serif text-[18px] text-warm-ivory">
            {entry.name}
          </span>
          {entry.neighborhood ? (
            <span className="text-[12px] text-warm-ivory/40">
              {entry.neighborhood}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-[13px] leading-[1.45] text-warm-ivory/52">
          {truncatedVerdict}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 pt-0.5">
        <StrengthBadge pct={strengthPct} />
        {entry.times_surfaced != null && entry.times_surfaced > 0 ? (
          <span className="text-[11px] text-warm-ivory/30">
            ×{entry.times_surfaced}
          </span>
        ) : null}
      </div>
    </Link>
  );
}

function StrengthBadge({ pct }: { pct: number }) {
  const color =
    pct >= 75
      ? "text-[#7BC4A0] border-[#7BC4A0]/40"
      : pct >= 50
        ? "text-muted-gold border-muted-gold/40"
        : "text-warm-ivory/35 border-white/[0.08]";

  return (
    <span
      className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] tabular-nums ${color}`}
    >
      {pct}
    </span>
  );
}
