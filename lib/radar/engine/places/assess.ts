/**
 * Place brain assessments (per jarvis-places-engine-brain-tree.md) — the cheap,
 * deterministic layers before the LLM council touches only finalists. Pure + tested.
 *
 * Truth — does it exist with real location/identity?
 * Role  — what role does the place play (the Places-specific layer)?
 * Fit   — evergreen: lives on radar/reserve; outdoor pauses on bad weather.
 * Planability — best time/window, pairings, logistics.
 *
 * Places are EVERGREEN — no expiration.
 */

import type {
  PlaceTruthAssessment,
  PlaceFitAssessment,
  PlaceRoleAssessment,
  PlacePlanabilityAssessment,
  PlaceRole,
} from "@/lib/radar/engine/places/config";

export type AssessablePlace = {
  title?: string | null;
  place_type?: string | null;
  sub_library?: string | null;
  description?: string | null;
  neighborhood?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  google_place_id?: string | null;
  source_url?: string | null;
  image_url?: string | null;
  vibe_keywords?: string[] | null;
  best_for?: string[] | null;
  verdict_strength?: number | null;
};

export type PlaceFitContext = {
  now?: Date;
  weatherBad?: boolean | null;
};

export function isHttpUrl(v: unknown): v is string {
  return typeof v === "string" && /^https?:\/\//i.test(v);
}

// ── Truth ────────────────────────────────────────────────────────────────────
export function assessPlaceTruth(p: AssessablePlace): PlaceTruthAssessment {
  const hasCoords = typeof p.lat === "number" && typeof p.lng === "number";
  const hasLocation = hasCoords || Boolean(p.address?.trim()) || Boolean(p.neighborhood?.trim());
  const hasGoogle = Boolean(p.google_place_id?.trim());
  const hasName = Boolean(p.title?.trim());

  const source_quality: PlaceTruthAssessment["source_quality"] = hasGoogle
    ? "verified"
    : isHttpUrl(p.source_url)
      ? "strong"
      : hasLocation
        ? "partial"
        : "weak";

  const verified_facts: string[] = [];
  const unsupported_claims: string[] = [];
  if (hasCoords) verified_facts.push("coords");
  else if (hasLocation) verified_facts.push("location");
  else unsupported_claims.push("no_location");
  if (hasGoogle) verified_facts.push("google_place_id");
  if (hasName) verified_facts.push("name");
  else unsupported_claims.push("no_name");

  return {
    exists_confidence: clamp01((hasName ? 0.3 : 0) + (hasLocation ? 0.35 : 0) + (hasGoogle ? 0.25 : 0) + (isHttpUrl(p.image_url) ? 0.1 : 0)),
    location_confidence: hasCoords ? 0.95 : hasLocation ? 0.6 : 0,
    identity_confidence: hasGoogle ? 0.9 : hasName ? 0.5 : 0,
    source_quality,
    google_place_id: p.google_place_id ?? null,
    source_url: p.source_url ?? null,
    verified_facts,
    unsupported_claims,
    needs_enrichment: !hasLocation || !hasName,
  };
}

// ── Role (the Places-specific layer) ─────────────────────────────────────────
export function assessRole(p: AssessablePlace): PlaceRoleAssessment {
  const blob = [p.title, p.place_type, p.description, ...(p.vibe_keywords ?? []), ...(p.best_for ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const sub = p.sub_library ?? "";

  let primary: PlaceRole;
  const secondary: PlaceRole[] = [];

  if (/cigar/.test(blob)) {
    primary = "cigar_walk_zone";
    secondary.push("drift_zone", "solo_context");
  } else if (sub === "places_outdoor" || /park|lakefront|trail|garden|riverwalk|scenic|beach|plaza/.test(blob)) {
    primary = "quiet_reset";
    secondary.push("photo_location", "low_friction_fallback");
  } else if (/bookstore|library/.test(blob)) {
    primary = "creative_input";
    secondary.push("solo_context", "low_friction_fallback");
  } else if (/hotel|lobby|lounge/.test(blob)) {
    primary = "meeting_spot";
    secondary.push("before_after_plan", "quiet_reset");
  } else if (sub === "places_neighborhoods" || /neighborhood|corridor|district|pocket|stretch/.test(blob)) {
    primary = "drift_zone";
    secondary.push("neighborhood_anchor", "before_after_plan");
  } else {
    primary = "destination";
    secondary.push("low_friction_fallback");
  }

  const repeatability: PlaceRoleAssessment["repeatability"] =
    primary === "quiet_reset" || primary === "drift_zone" ? "high" : "medium";

  return {
    primary_role: primary,
    secondary_roles: secondary,
    best_use_case: bestUseCase(primary),
    not_for: [],
    repeatability,
  };
}

function bestUseCase(role: PlaceRole): string {
  switch (role) {
    case "cigar_walk_zone":
      return "An after-dinner cigar walk";
    case "quiet_reset":
      return "A low-pressure reset or decompression";
    case "creative_input":
      return "A solo browse for ideas and input";
    case "meeting_spot":
      return "A quiet drink, meeting, or after-dinner anchor";
    case "drift_zone":
      return "Drift through before or after another plan";
    default:
      return "A place worth knowing in rotation";
  }
}

// ── Fit (evergreen) ──────────────────────────────────────────────────────────
export function assessPlaceFit(p: AssessablePlace, ctx: PlaceFitContext = {}): PlaceFitAssessment {
  const reasons: string[] = [];
  const vetoes: string[] = [];
  const isOutdoor = p.sub_library === "places_outdoor";

  // Outdoor places pause (don't suppress permanently) on bad weather.
  let friction_level: PlaceFitAssessment["friction_level"] = "low";
  if (isOutdoor && ctx.weatherBad) {
    friction_level = "high";
    reasons.push("Outdoor place on a bad-weather day — hold until it clears.");
  }

  // Evergreen: places live on Radar/Reserve as things worth knowing, not "today".
  const recommended_surface: PlaceFitAssessment["recommended_surface"] =
    isOutdoor && ctx.weatherBad ? "reserve" : "radar";

  const fit_score = isOutdoor && ctx.weatherBad ? 0.4 : 0.75;

  return {
    fit_score: clamp01(fit_score),
    timing_fit: "later", // evergreen — no urgency
    friction_level,
    recommended_surface,
    reasons,
    vetoes,
  };
}

// ── Planability ──────────────────────────────────────────────────────────────
export function assessPlacePlanability(p: AssessablePlace): PlacePlanabilityAssessment {
  const missing: string[] = [];
  const hasLocation = (typeof p.lat === "number" && typeof p.lng === "number") || Boolean(p.address?.trim() || p.neighborhood?.trim());
  if (!hasLocation) missing.push("location");
  const isOutdoor = p.sub_library === "places_outdoor";
  return {
    plan_ready: hasLocation,
    best_time: isOutdoor ? "Golden hour or a clear afternoon" : "A quiet weekday or unhurried weekend",
    suggested_duration: isOutdoor ? "30–60 min" : "30–45 min",
    nearby_pairings: ["Coffee or a meal nearby", "Pair with another stop in the area"],
    logistics_notes: p.neighborhood ? [`Neighborhood: ${p.neighborhood}`] : [],
    missing_plan_data: missing,
  };
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
}
