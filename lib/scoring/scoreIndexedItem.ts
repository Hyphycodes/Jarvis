import { scoreCandidate } from "@/lib/scoring/scoreCandidate";
import type { ScoreBreakdown, ScoringContext } from "@/lib/scoring/types";
import type { IndexedItem } from "@/lib/index/types";
import type { NormalizedCandidate } from "@/lib/ai/types";

/**
 * Deterministic 0–1 score for an indexed item. Wraps scoreCandidate so the
 * weights stay aligned with the rest of the scoring layer. Neutral defaults
 * for the dimensions that need external lookups (distance / weather / open).
 */
export function scoreIndexedItem(
  item: IndexedItem,
  context: ScoringContext = {},
): ScoreBreakdown {
  return scoreCandidate(toCandidate(item), context);
}

function toCandidate(item: IndexedItem): NormalizedCandidate {
  return {
    id: item.id,
    source: mapSource(item.source),
    kind: mapKind(item.type),
    title: item.title,
    subtitle: item.subtitle,
    description: item.description,
    datetime: item.startsAt,
    location:
      item.locationName || item.address || item.lat != null
        ? {
            name: item.locationName,
            address: item.address,
            lat: item.lat,
            lng: item.lng,
          }
        : undefined,
    tags: item.tags,
    raw: item.rawPayload,
  };
}

function mapSource(source: IndexedItem["source"]): NormalizedCandidate["source"] {
  if (
    source === "directory" ||
    source === "research" ||
    source === "calendar" ||
    source === "contacts" ||
    source === "memory" ||
    source === "manual"
  ) {
    return source;
  }
  return "manual";
}

function mapKind(type: IndexedItem["type"]): NormalizedCandidate["kind"] {
  switch (type) {
    case "restaurant":
    case "place":
    case "real_estate":
      return "place";
    case "event":
    case "culture":
      return "event";
    case "person":
    case "relationship_update":
      return "person";
    case "task":
      return "task";
    case "north_step":
    case "pillar_signal":
      return "north_goal";
    default:
      return "memory_signal";
  }
}
