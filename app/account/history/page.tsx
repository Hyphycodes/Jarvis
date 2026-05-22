import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getViewableProfileId } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { listIndexItems } from "@/lib/index/repo";
import { BackButton, MotionPage } from "@/components";
import type { IndexItemStatus, IndexedItem } from "@/lib/index/types";
import type { SurfacedItemRow } from "@/lib/types/database";
import { rowToIndexedItem } from "@/lib/index/repo";
import { RestoreItemButton } from "./client-bits";

export const metadata = { title: "History · Account" };
export const dynamic = "force-dynamic";

const LIFECYCLE_GROUPS: Array<{
  label: string;
  statuses: IndexItemStatus[];
  empty: string;
  showRestore?: boolean;
}> = [
  { label: "Saved", statuses: ["saved"], empty: "Nothing saved yet." },
  { label: "Planned", statuses: ["planned"], empty: "Nothing planned." },
  {
    label: "Completed",
    statuses: ["completed"],
    empty: "Nothing completed yet.",
  },
  {
    label: "Passed",
    statuses: ["passed"],
    empty: "Nothing passed yet.",
    showRestore: true,
  },
  {
    label: "Expired",
    statuses: ["expired"],
    empty: "No expired events.",
    showRestore: true,
  },
  {
    label: "Archived",
    statuses: ["archived"],
    empty: "Archive is empty.",
    showRestore: true,
  },
  {
    label: "Recently shown",
    statuses: ["shown", "opened", "discovered"],
    empty: "Nothing surfaced recently.",
  },
];

export default async function HistoryPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/account/history");

  const [lifecycleItems, holdingItems] = await Promise.all([
    safeListHistoryItems(),
    safeListHoldingItems(),
  ]);

  const grouped = groupItems(lifecycleItems);

  return (
    <main
      className="smooth-page mx-auto min-h-[100dvh] w-full max-w-[680px] overflow-x-hidden bg-near-black px-6 text-warm-ivory"
      style={{
        paddingTop: "calc(env(safe-area-inset-top) + 32px)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 36px)",
      }}
    >
      <MotionPage>
        <header className="flex items-baseline justify-between">
          <BackButton fallbackHref="/account" />
          <Link
            href="/account"
            className="text-[16px] font-medium text-warm-ivory transition-colors duration-300 ease-atmospheric hover:text-warm-ivory/80"
          >
            Done
          </Link>
        </header>

        <section className="mt-6">
          <span className="text-[11px] uppercase tracking-editorial text-muted-gold">
            History
          </span>
          <h1 className="mt-2 font-serif text-[52px] italic leading-[1.0] tracking-[-0.01em] text-warm-ivory">
            Front room and back room.
          </h1>
          <p className="mt-4 max-w-[40ch] font-serif text-[22px] italic leading-[1.25] text-warm-ivory/70">
            Everything Jarvis has found — saved, passed, held, and expired.
            Nothing deleted unless you ask.
          </p>
        </section>

        <div
          className="my-8 h-px w-full"
          style={{ background: "rgba(255, 250, 240, 0.06)" }}
        />

        <div className="flex flex-col gap-10">
          {/* Holding / Later — anchored for intelligence page link */}
          <section id="holding">
            <div className="flex items-baseline justify-between">
              <h2 className="text-[11px] uppercase tracking-editorial text-muted-gold">
                Holding / Later
              </h2>
              <span className="text-[11px] text-warm-ivory/45">
                {holdingItems.length}
              </span>
            </div>
            <p className="mt-1 text-[12px] text-warm-ivory/40">
              Strong finds that aren&apos;t urgent. Promoted to Active Radar
              when timing is right.
            </p>
            {holdingItems.length === 0 ? (
              <p className="mt-3 text-[13px] text-warm-ivory/45">
                The back room is empty. Good finds will appear here when
                Radar is full or timing isn&apos;t right yet.
              </p>
            ) : (
              <ul className="mt-3 flex flex-col divide-y divide-white/[0.05]">
                {holdingItems.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 py-3"
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
                      {item.reasons[0] ? (
                        <div className="mt-0.5 truncate text-[11px] text-warm-ivory/35 italic">
                          {item.reasons[0]}
                        </div>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-[11px] text-warm-ivory/30">
                      {item.category ?? item.type}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Lifecycle groups */}
          {LIFECYCLE_GROUPS.map((group) => (
            <HistoryGroup
              key={group.label}
              label={group.label}
              empty={group.empty}
              items={pickStatuses(grouped, group.statuses)}
              showRestore={group.showRestore ?? false}
            />
          ))}
        </div>
      </MotionPage>
    </main>
  );
}

async function safeListHistoryItems(): Promise<IndexedItem[]> {
  try {
    // Exclude holding-destination items — shown in their own section.
    return await listIndexItems({ includeExpired: true, limit: 200 });
  } catch (error) {
    console.error("[surface-loader] account.history", error);
    return [];
  }
}

async function safeListHoldingItems(): Promise<IndexedItem[]> {
  try {
    const { id } = await getViewableProfileId();
    if (!id) return [];
    const supabase = await getServerSupabase();
    const { data, error } = await supabase
      .from("surfaced_items")
      .select("*")
      .eq("user_id", id)
      .eq("destination", "holding")
      .in("status", ["discovered", "shown"])
      .order("score", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(30);
    if (error) {
      console.error("[surface-loader] account.history.holding", error);
      return [];
    }
    return ((data ?? []) as SurfacedItemRow[]).map(rowToIndexedItem);
  } catch (error) {
    console.error("[surface-loader] account.history.holding", error);
    return [];
  }
}

function HistoryGroup({
  label,
  items,
  empty,
  showRestore,
}: {
  label: string;
  items: IndexedItem[];
  empty: string;
  showRestore: boolean;
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between">
        <h2 className="text-[11px] uppercase tracking-editorial text-muted-gold">
          {label}
        </h2>
        <span className="text-[11px] text-warm-ivory/45">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="mt-3 text-[13px] text-warm-ivory/45">{empty}</p>
      ) : (
        <ul className="mt-3 flex flex-col divide-y divide-white/[0.05]">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-3 py-3"
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
              </div>
              {showRestore ? <RestoreItemButton itemId={item.id} /> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function groupItems(items: IndexedItem[]): Map<IndexItemStatus, IndexedItem[]> {
  const map = new Map<IndexItemStatus, IndexedItem[]>();
  for (const item of items) {
    // Holding items are handled separately — skip them here.
    if (item.destination === "holding") continue;
    const bucket = map.get(item.status) ?? [];
    bucket.push(item);
    map.set(item.status, bucket);
  }
  return map;
}

function pickStatuses(
  grouped: Map<IndexItemStatus, IndexedItem[]>,
  statuses: IndexItemStatus[],
): IndexedItem[] {
  return statuses.flatMap((status) => grouped.get(status) ?? []);
}
