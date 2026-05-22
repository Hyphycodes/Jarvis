import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { listIndexItems } from "@/lib/index/repo";
import { BackButton, MotionPage } from "@/components";
import type { IndexItemStatus, IndexedItem } from "@/lib/index/types";
import { RestoreItemButton } from "./client-bits";

export const metadata = { title: "History · Account" };
export const dynamic = "force-dynamic";

const GROUPS: Array<{
  label: string;
  statuses: IndexItemStatus[];
  empty: string;
}> = [
  { label: "Saved", statuses: ["saved"], empty: "Nothing saved yet." },
  { label: "Planned", statuses: ["planned"], empty: "Nothing planned." },
  { label: "Completed", statuses: ["completed"], empty: "Nothing completed yet." },
  { label: "Passed", statuses: ["passed"], empty: "Nothing passed yet." },
  { label: "Expired", statuses: ["expired"], empty: "No expired events." },
  { label: "Archived", statuses: ["archived"], empty: "Archive is empty." },
  {
    label: "Recently shown",
    statuses: ["shown", "opened", "discovered"],
    empty: "Nothing surfaced recently.",
  },
];

export default async function HistoryPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/account/history");

  const items = await listIndexItems({ includeExpired: true, limit: 200 });
  const grouped = groupItems(items);

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
            What Jarvis has shown you.
          </h1>
          <p className="mt-4 max-w-[40ch] font-serif text-[22px] italic leading-[1.25] text-warm-ivory/70">
            Everything surfaced — saved, passed, planned, completed, expired.
            Nothing is deleted unless you ask.
          </p>
        </section>

        <div className="my-8 h-px w-full" style={{ background: "rgba(255, 250, 240, 0.06)" }} />

        <div className="flex flex-col gap-10">
          {GROUPS.map((group) => (
            <HistoryGroup
              key={group.label}
              label={group.label}
              empty={group.empty}
              items={pickStatuses(grouped, group.statuses)}
              showRestore={
                group.label === "Passed" ||
                group.label === "Archived" ||
                group.label === "Expired"
              }
            />
          ))}
        </div>
      </MotionPage>
    </main>
  );
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
            <li key={item.id} className="flex items-center justify-between gap-3 py-3">
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
