import "server-only";

import type { IndexedItem } from "@/lib/index/types";
import type { TruthRead } from "@/lib/intelligence/types";

export function readTruth(item: IndexedItem): TruthRead {
  const knownDetails: string[] = [];
  const missingDetails: string[] = [];
  const flags: string[] = [];
  let evidenceQuality = item.briefing?.confidence ?? item.score ?? 0.5;

  if (item.url) knownDetails.push("Source link");
  else missingDetails.push("source");

  if (item.locationName || item.address) knownDetails.push("Location");
  else if (needsLocation(item)) missingDetails.push("location");

  if (item.startsAt || item.endsAt) knownDetails.push("Timing");
  else if (needsTiming(item)) missingDetails.push("time window");

  if (item.briefing?.evidence_summary) knownDetails.push("Evidence summary");
  else missingDetails.push("evidence summary");

  if (item.briefing?.spending_posture === "unknown") missingDetails.push("cost");

  if (missingDetails.length >= 3) {
    flags.push("details_light");
    evidenceQuality -= 0.08;
  }
  if (!item.briefing) {
    flags.push("briefing_missing");
    evidenceQuality -= 0.12;
  }

  return {
    evidenceQuality: clamp01(evidenceQuality),
    knownDetails,
    missingDetails: Array.from(new Set(missingDetails)),
    flags,
  };
}

function needsLocation(item: IndexedItem): boolean {
  return /restaurant|event|place|activity|outdoors|health/.test(`${item.type} ${item.category ?? ""}`);
}

function needsTiming(item: IndexedItem): boolean {
  return /event|activity|dining|restaurant|culture|outdoors/.test(`${item.type} ${item.category ?? ""}`);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

