import type {
  IndexDestination,
  IndexedItem,
} from "@/lib/index/types";

const RADAR_TYPES = new Set([
  "restaurant",
  "event",
  "culture",
  "place",
  "product",
  "travel",
  "real_estate",
  "style",
  "creative",
  "faith",
  "health",
  "recommendation",
]);

const NORTH_TYPES = new Set(["north_step", "pillar_signal"]);

const CIRCLE_TYPES = new Set(["person", "relationship_update"]);

/**
 * Deterministic placement of an indexed item to the surfaces it belongs on.
 * No AI. An item can land in multiple places (e.g. a planned dinner shows
 * on Today and on its plan detail).
 */
export function dispatchItem(item: IndexedItem): IndexDestination[] {
  const destinations = new Set<IndexDestination>();

  if (item.destination) destinations.add(item.destination);

  if (NORTH_TYPES.has(item.type) || item.tags.includes("north")) {
    destinations.add("north");
  }

  if (CIRCLE_TYPES.has(item.type)) {
    destinations.add("circle");
  }

  if (RADAR_TYPES.has(item.type)) {
    if (item.status === "discovered" || item.status === "shown") {
      destinations.add("radar");
    }
  }

  if (item.status === "planned" || item.status === "saved") {
    if (item.startsAt && isToday(item.startsAt)) {
      destinations.add("today");
    }
  }

  if (
    item.type === "plan" ||
    (isRecord(item.rawPayload) && typeof item.rawPayload.plan_id === "string")
  ) {
    destinations.add("plan");
  }

  return Array.from(destinations);
}

function isToday(iso: string): boolean {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return (
    date.getUTCFullYear() === now.getUTCFullYear() &&
    date.getUTCMonth() === now.getUTCMonth() &&
    date.getUTCDate() === now.getUTCDate()
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
