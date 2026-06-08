/**
 * Shared lane-engine contract (per radar-lane-engine-replication.md). Lane behavior
 * — detail route, schedule/expire semantics, North pillars, required facts — is
 * declared here in ONE place instead of being hardcoded across the codebase.
 *
 * Pure + dependency-light so it's unit-testable and importable anywhere (client or
 * server). Dining is the reference; every lane uses the same skeleton with its own rules.
 */

import { RADAR_CATEGORIES, type RadarCategory } from "@/lib/radar/category";
import type { PillarSlug } from "@/lib/north/attributionMap";
import { DINING_SUBLIBRARIES, type SubLibraryConfig } from "@/lib/radar/engine/sources";

export type RadarLane = RadarCategory; // moves | events | culture | dining | places | finds

/** Where a card's detail/CTA lives. Finds keeps its buyer UI; culture/places get a brief. */
export type LaneDetailRoute = "plan" | "find" | "brief";

export type LaneEngineConfig = {
  lane: RadarLane;
  label: string;
  detailRoute: LaneDetailRoute;
  /** Add-to-Calendar / scheduling makes sense for this lane. */
  canSchedule: boolean;
  /** Cards can expire (dated/time-sensitive). Evergreen lanes go to reserve, not death. */
  canExpire: boolean;
  /** Candidate North pillars this lane tends to credit (synthesis, not low-level logic). */
  northPillars: PillarSlug[];
  /** Facts a candidate must have to be "ready" to feature (drives laneReadiness). */
  requiredFacts: ReadonlyArray<RequiredFact>;
};

export type RequiredFact =
  | "location"
  | "date_time"
  | "venue"
  | "source"
  | "price"
  | "image"
  | "budget_tier"
  | "cultural_reason"
  | "action_or_sequence";

export const LANE_ENGINE: Record<RadarLane, LaneEngineConfig> = {
  dining: {
    lane: "dining",
    label: "Dining",
    detailRoute: "plan",
    canSchedule: true,
    canExpire: false,
    northPillars: ["taste", "relationships"],
    requiredFacts: ["location"],
  },
  events: {
    lane: "events",
    label: "Events",
    detailRoute: "plan",
    canSchedule: true,
    canExpire: true,
    northPillars: ["taste", "creative", "relationships"],
    requiredFacts: ["date_time", "venue", "source"],
  },
  culture: {
    lane: "culture",
    label: "Culture",
    detailRoute: "brief",
    canSchedule: true, // only when dated
    canExpire: true, // only when dated
    northPillars: ["taste", "creative", "skill", "peace"],
    requiredFacts: ["cultural_reason"],
  },
  places: {
    lane: "places",
    label: "Places",
    detailRoute: "brief",
    canSchedule: false,
    canExpire: false,
    northPillars: ["taste", "peace"],
    requiredFacts: ["location"],
  },
  moves: {
    lane: "moves",
    label: "Moves",
    detailRoute: "plan",
    canSchedule: true,
    canExpire: false, // weather-specific moves pause, but moves don't die by age
    northPillars: ["body", "peace", "skill"],
    requiredFacts: ["action_or_sequence"],
  },
  finds: {
    lane: "finds",
    label: "Finds",
    detailRoute: "find", // keeps Product Researcher + /find/[id]
    canSchedule: false,
    canExpire: false,
    northPillars: ["taste", "ownership", "peace"],
    requiredFacts: ["price", "image", "budget_tier"],
  },
};

export function laneConfig(lane: string | null | undefined): LaneEngineConfig | null {
  if (!lane) return null;
  return LANE_ENGINE[lane as RadarLane] ?? null;
}

export function detailRouteFor(lane: string | null | undefined): LaneDetailRoute {
  return laneConfig(lane)?.detailRoute ?? "brief";
}

export function laneCanExpire(lane: string | null | undefined): boolean {
  return laneConfig(lane)?.canExpire ?? false;
}

export function laneCanSchedule(lane: string | null | undefined): boolean {
  return laneConfig(lane)?.canSchedule ?? false;
}

export function allLanes(): RadarLane[] {
  return [...RADAR_CATEGORIES];
}

/**
 * Unified sub-library registry. Today only dining has physical sub-library tables
 * (the engine reference); other lanes are served by the existing pipeline until
 * their engines are built + cut over lane-by-lane. New lanes register their
 * SubLibraryConfig here and the generalized stage functions pick them up.
 */
export const SUBLIBRARIES: Record<string, SubLibraryConfig> = {
  ...DINING_SUBLIBRARIES,
};

export function subLibrariesForLane(lane: string): SubLibraryConfig[] {
  return Object.values(SUBLIBRARIES).filter((cfg) => cfg.lane === lane);
}

/** Lanes that currently have a physical sub-library engine (vs. old pipeline). */
export function lanesWithEngine(): RadarLane[] {
  const lanes = new Set<RadarLane>();
  for (const cfg of Object.values(SUBLIBRARIES)) {
    if (LANE_ENGINE[cfg.lane as RadarLane]) lanes.add(cfg.lane as RadarLane);
  }
  return [...lanes];
}
