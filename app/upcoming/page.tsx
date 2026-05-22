import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser, getViewableProfileId } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { rowToIndexedItem } from "@/lib/index/repo";
import { BackButton, MotionPage } from "@/components";
import type { IndexedItem } from "@/lib/index/types";
import type { SurfacedItemRow } from "@/lib/types/database";

export const metadata = { title: "Upcoming · Jarvis" };
export const dynamic = "force-dynamic";

type Bucket =
  | "today"
  | "tomorrow"
  | "this_week"
  | "later"
  | "no_date";

const BUCKET_ORDER: Bucket[] = [
  "today",
  "tomorrow",
  "this_week",
  "later",
  "no_date",
];

const BUCKET_LABEL: Record<Bucket, string> = {
  today: "Today",
  tomorrow: "Tomorrow",
  this_week: "This Week",
  later: "Later",
  no_date: "No Date Yet",
};

export default async function UpcomingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/upcoming");

  const items = await safeListUpcomingItems();
  const grouped = groupByBucket(items);

  const total = items.length;

  return (
    <main
      className="smooth-page mx-auto min-h-[100dvh] w-full max-w-[680px] overflow-x-hidden bg-near-black px-6 text-warm-ivory"
      style={{
        paddingTop: "calc(env(safe-area-inset-top) + 32px)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 48px)",
      }}
    >
      <MotionPage>
        <header className="flex items-baseline justify-between">
          <BackButton fallbackHref="/" />
          <Link
            href="/"
            className="text-[16px] font-medium text-warm-ivory transition-colors duration-300 ease-atmospheric hover:text-warm-ivory/80"
          >
            Today
          </Link>
        </header>

        <section className="mt-6">
          <span className="text-[11px] uppercase tracking-editorial text-muted-gold">
            Upcoming
          </span>
          <h1 className="mt-2 font-serif text-[44px] italic leading-[1.05] tracking-[-0.01em] text-warm-ivory">
            What&apos;s on deck.
          </h1>
          <p className="mt-3 max-w-[40ch] text-[14px] leading-[1.55] text-warm-ivory/65">
            Saved and planned items grouped by when they happen. Time-sensitive
            things bubble up automatically — undated saves stay in Holding.
          </p>
        </section>

        <div
          className="my-8 h-px w-full"
          style={{ background: "rgba(255, 250, 240, 0.06)" }}
        />

        {total === 0 ? (
          <p className="text-[14px] leading-[1.55] text-warm-ivory/55">
            Nothing on the agenda. Saved items with dates will appear here.
            Undated saves live in{" "}
            <Link
              href="/account/history#holding"
              className="text-muted-gold hover:text-muted-gold/80"
            >
              Holding
            </Link>
            .
          </p>
        ) : (
          <div className="flex flex-col gap-10">
            {BUCKET_ORDER.map((bucket) => (
              <BucketSection
                key={bucket}
                label={BUCKET_LABEL[bucket]}
                items={grouped.get(bucket) ?? []}
              />
            ))}
          </div>
        )}
      </MotionPage>
    </main>
  );
}

function BucketSection({
  label,
  items,
}: {
  label: string;
  items: IndexedItem[];
}) {
  if (items.length === 0) return null;
  return (
    <section>
      <div className="flex items-baseline justify-between">
        <h2 className="text-[11px] uppercase tracking-editorial text-muted-gold">
          {label}
        </h2>
        <span className="text-[11px] text-warm-ivory/45">{items.length}</span>
      </div>
      <ul className="mt-3 flex flex-col divide-y divide-white/[0.05]">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={`/item/${item.id}`}
              className="flex items-start justify-between gap-3 py-3 transition-colors duration-300 ease-atmospheric hover:bg-white/[0.012]"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-serif text-[18px] leading-tight text-warm-ivory">
                  {item.title}
                </div>
                {item.subtitle ? (
                  <div className="mt-0.5 truncate text-[12px] text-warm-ivory/55">
                    {item.subtitle}
                  </div>
                ) : null}
                {item.locationName ? (
                  <div className="mt-0.5 truncate text-[11px] text-warm-ivory/40">
                    {item.locationName}
                  </div>
                ) : null}
              </div>
              <div className="shrink-0 text-right text-[11px] text-warm-ivory/45">
                {formatWhen(item.startsAt)}
                <br />
                <span className="text-warm-ivory/30">
                  {(item.category ?? item.type).toUpperCase()}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Data ────────────────────────────────────────────────────────────────────

async function safeListUpcomingItems(): Promise<IndexedItem[]> {
  try {
    const { id } = await getViewableProfileId();
    if (!id) return [];
    const supabase = await getServerSupabase();

    const nowIso = new Date().toISOString();

    // Pull saved + planned + dated upcoming items.
    // Includes destination="upcoming" (explicit) plus anything saved/planned
    // with a future starts_at regardless of destination — so a "saved" item
    // not yet moved to upcoming still shows up here.
    const { data, error } = await supabase
      .from("surfaced_items")
      .select("*")
      .eq("user_id", id)
      .or(
        [
          // Explicit upcoming destination
          `destination.eq.upcoming`,
          // Future-dated saved/planned items in any non-archive destination
          `and(status.in.(saved,planned),starts_at.gte.${nowIso})`,
          // Items planned without a date — show in "No Date Yet"
          `and(status.eq.planned,starts_at.is.null)`,
        ].join(","),
      )
      .order("starts_at", { ascending: true, nullsFirst: false })
      .limit(60);

    if (error) {
      console.error("[upcoming] list error", error);
      return [];
    }
    return ((data ?? []) as SurfacedItemRow[]).map(rowToIndexedItem);
  } catch (error) {
    console.error("[upcoming] safeList error", error);
    return [];
  }
}

function groupByBucket(items: IndexedItem[]): Map<Bucket, IndexedItem[]> {
  const map = new Map<Bucket, IndexedItem[]>();
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
  const endOfTomorrow = new Date(startOfToday.getTime() + 48 * 60 * 60 * 1000);
  const endOfWeek = new Date(startOfToday.getTime() + 7 * 24 * 60 * 60 * 1000);

  for (const item of items) {
    const bucket = bucketFor(
      item.startsAt,
      startOfToday,
      endOfToday,
      endOfTomorrow,
      endOfWeek,
    );
    const arr = map.get(bucket) ?? [];
    arr.push(item);
    map.set(bucket, arr);
  }
  return map;
}

function bucketFor(
  startsAt: string | undefined,
  startOfToday: Date,
  endOfToday: Date,
  endOfTomorrow: Date,
  endOfWeek: Date,
): Bucket {
  if (!startsAt) return "no_date";
  try {
    const d = new Date(startsAt);
    if (Number.isNaN(d.getTime())) return "no_date";
    const t = d.getTime();
    if (t >= startOfToday.getTime() && t < endOfToday.getTime()) return "today";
    if (t >= endOfToday.getTime() && t < endOfTomorrow.getTime())
      return "tomorrow";
    if (t >= endOfTomorrow.getTime() && t < endOfWeek.getTime())
      return "this_week";
    return "later";
  } catch {
    return "no_date";
  }
}

function formatWhen(iso?: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}
