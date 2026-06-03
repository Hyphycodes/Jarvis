import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getIndexItem } from "@/lib/index/repo";
import { resolveBrief } from "@/lib/items/resolveBrief";
import { ConsiderationBrief } from "@/components/radar/ConsiderationBrief";
import type { IndexedItem } from "@/lib/index/types";
import type { Json } from "@/lib/types/database";

export const metadata = { title: "Consideration Brief · Jarvis" };
export const dynamic = "force-dynamic";

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=/item/${encodeURIComponent(id)}`);

  const item = await getIndexItem(id);
  if (!item) notFound();

  const brief = await resolveBrief(item);
  const plan = readPlanContext(item);
  const isEvent = Boolean(item.startsAt) || item.type === "event";

  return (
    <ConsiderationBrief
      itemId={item.id}
      brief={brief}
      badgeLabel={prettyLabel(item.category ?? item.type)}
      title={brief.short_title || item.title}
      description={item.description}
      neighborhood={item.locationName ?? item.address}
      address={item.address}
      url={item.url}
      phone={readPhone(item.rawPayload)}
      dateLabel={isEvent ? formatDateLabel(item.startsAt) : undefined}
      isEvent={isEvent}
      isSaved={item.status === "saved"}
      hasPlan={Boolean(plan.planSlug)}
      planSlug={plan.planSlug}
      showActions={!["completed", "expired"].includes(item.status)}
    />
  );
}

function readPlanContext(item: IndexedItem): { planSlug?: string } {
  const raw = isRecord(item.rawPayload) ? item.rawPayload : {};
  const planSlug =
    typeof raw.plan_slug === "string" ? raw.plan_slug : undefined;
  return { planSlug };
}

function readPhone(payload: Json): string | undefined {
  if (!isRecord(payload)) return undefined;
  for (const key of ["phone", "phone_number", "formatted_phone_number"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function prettyLabel(value?: string): string {
  if (!value) return "On Radar";
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDateLabel(iso?: string): string | undefined {
  if (!iso) return undefined;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return undefined;
    return d
      .toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
      .toUpperCase();
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
