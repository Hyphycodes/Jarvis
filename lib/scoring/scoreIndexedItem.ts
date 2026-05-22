import { scoreCandidate } from "@/lib/scoring/scoreCandidate";
import type { ScoreBreakdown, ScoringContext } from "@/lib/scoring/types";
import type { IndexedItem } from "@/lib/index/types";
import type { NormalizedCandidate } from "@/lib/ai/types";
import { getDefaultLocation } from "@/lib/env";

export type IndexedItemScoringContext = ScoringContext & {
  homeLat?: number;
  homeLng?: number;
  now?: string;
  currentWeather?: { temperatureF?: number; precipitationProbability?: number };
  northTags?: string[];
  recentPassCategories?: string[];
};

export type IndexedItemScore = {
  total: number;
  breakdown: ScoreBreakdown;
  reasons: string[];
};

const RADAR_RECENCY_HOURS = 7 * 24;

export function scoreIndexedItem(
  item: IndexedItem,
  context: IndexedItemScoringContext = {},
): IndexedItemScore {
  const breakdown = scoreCandidate(toCandidate(item), context);
  const home = resolveHome(context);
  const now = context.now ? new Date(context.now) : new Date();
  const reasons: string[] = [];
  let modifier = 0;

  // Distance from home.
  if (item.lat != null && item.lng != null && home) {
    const miles = haversineMiles(home.lat, home.lng, item.lat, item.lng);
    if (miles < 2) {
      modifier += 0.05;
      reasons.push("Close to home");
    } else if (miles < 8) {
      modifier += 0.02;
      reasons.push("Comfortable drive");
    } else if (miles > 25) {
      modifier -= 0.05;
      reasons.push("Far from home");
    }
  }

  // Timing fit.
  if (item.startsAt) {
    const startsAt = new Date(item.startsAt).getTime();
    const diffHours = (startsAt - now.getTime()) / (1000 * 60 * 60);
    if (diffHours >= 0 && diffHours <= 6) {
      modifier += 0.08;
      reasons.push("Starts soon");
    } else if (diffHours > 6 && diffHours <= 24) {
      modifier += 0.05;
      reasons.push("Tonight or tomorrow");
    } else if (diffHours > 24 && diffHours <= RADAR_RECENCY_HOURS) {
      modifier += 0.02;
      reasons.push("Starts this week");
    } else if (diffHours < -2) {
      modifier -= 0.2;
      reasons.push("Already started");
    }
  }

  // Expiration urgency.
  if (item.expiresAt) {
    const expiresAt = new Date(item.expiresAt).getTime();
    const hoursLeft = (expiresAt - now.getTime()) / (1000 * 60 * 60);
    if (hoursLeft > 0 && hoursLeft <= 6) {
      modifier += 0.04;
      reasons.push("Window closing soon");
    }
    if (hoursLeft <= 0) {
      modifier -= 0.4;
      reasons.push("Expired");
    }
  }

  // Category fit (favors atmospheric / dining / culture lanes).
  if (item.category) {
    if (["dining", "culture", "music", "places"].includes(item.category)) {
      modifier += 0.04;
      reasons.push(`Matches ${item.category} taste`);
    }
    if (
      context.recentPassCategories?.includes(item.category) &&
      item.status !== "saved"
    ) {
      modifier -= 0.06;
      reasons.push("Passed similar item recently");
    }
  }

  // Source quality bias.
  if (item.source === "places") {
    modifier += 0.02;
  } else if (item.source === "research") {
    modifier -= 0.02;
  }

  // Open-now bonus for places.
  if (item.tags.includes("open_now")) {
    modifier += 0.03;
    reasons.push("Open now");
  }

  // Weather fit — penalize cold/rainy outdoor items.
  if (context.currentWeather) {
    const temp = context.currentWeather.temperatureF;
    const precip = context.currentWeather.precipitationProbability;
    const outdoorTag = item.tags.some((t) =>
      ["outdoor", "patio", "park", "golf"].includes(t),
    );
    if (outdoorTag) {
      if (temp != null && temp < 45) {
        modifier -= 0.05;
        reasons.push("Cold for outdoor");
      } else if (precip != null && precip >= 60) {
        modifier -= 0.05;
        reasons.push("Rain likely");
      } else if (temp != null && temp >= 60 && (precip ?? 0) < 30) {
        modifier += 0.03;
        reasons.push("Weather friendly");
      }
    }
  }

  // North alignment.
  if (context.northTags?.length && item.tags.length) {
    const overlap = context.northTags.filter((t) => item.tags.includes(t));
    if (overlap.length) {
      modifier += 0.05;
      reasons.push(`Aligned with North: ${overlap[0]}`);
    }
  }

  // Existing user-action lifecycle hints.
  if (item.status === "saved") {
    modifier += 0.1;
    reasons.push("Previously saved");
  } else if (item.status === "passed") {
    modifier -= 0.5;
    reasons.push("Already passed");
  } else if (item.status === "completed") {
    modifier -= 0.3;
    reasons.push("Already done");
  }

  const total = clamp01(breakdown.total + modifier);

  // De-duplicate while preserving order.
  const seen = new Set<string>();
  const uniqueReasons = reasons.filter((r) =>
    seen.has(r) ? false : (seen.add(r), true),
  );

  return {
    total,
    breakdown,
    reasons: uniqueReasons,
  };
}

function resolveHome(
  context: IndexedItemScoringContext,
): { lat: number; lng: number } | null {
  if (context.homeLat != null && context.homeLng != null) {
    return { lat: context.homeLat, lng: context.homeLng };
  }
  try {
    const home = getDefaultLocation();
    return { lat: home.lat, lng: home.lng };
  } catch {
    return null;
  }
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

function haversineMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 3959;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
