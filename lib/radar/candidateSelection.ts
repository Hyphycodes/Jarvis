// Pure, unit-testable selection + classification helpers for the Candidate
// Inbox → research pipeline. No "server-only" / IO imports so this can be
// exercised directly with tsx.

import {
  normalizeRadarClassification,
  normalizeRadarCategory,
  RADAR_CATEGORIES,
  type RadarCategory,
} from "@/lib/radar/category";
import type { RadarCandidateInboxRow } from "@/lib/types/database";

export type QueueEntry = {
  row: RadarCandidateInboxRow;
  category: RadarCategory | null;
  userIntent: boolean;
};

/**
 * Distribute a bounded research budget fairly across the inbox.
 *
 * - Owner/voice intent (`source: "user_intent"`) always leads — the owner asked.
 * - The remainder is drained round-robin across the six categories, so a single
 *   high-scoring lane (historically dining) can no longer consume the whole run
 *   and starve culture/events/places/moves/style.
 * - Leftover budget backfills with uncategorized rows (sources/legacy).
 */
export function selectFairly(rows: RadarCandidateInboxRow[], budget: number): QueueEntry[] {
  const entries: QueueEntry[] = rows.map((row) => ({
    row,
    category: rowCategory(row),
    userIntent: rowSource(row) === "user_intent",
  }));

  const userIntents = entries.filter((e) => e.userIntent);
  const rest = entries.filter((e) => !e.userIntent);

  const byCategory = new Map<RadarCategory, QueueEntry[]>();
  const uncategorized: QueueEntry[] = [];
  for (const entry of rest) {
    if (entry.category) {
      const list = byCategory.get(entry.category) ?? [];
      list.push(entry);
      byCategory.set(entry.category, list);
    } else {
      uncategorized.push(entry);
    }
  }

  const out: QueueEntry[] = [...userIntents];
  let progress = true;
  while (out.length < budget && progress) {
    progress = false;
    for (const category of RADAR_CATEGORIES) {
      if (out.length >= budget) break;
      const next = byCategory.get(category)?.shift();
      if (next) {
        out.push(next);
        progress = true;
      }
    }
  }
  for (const entry of uncategorized) {
    if (out.length >= budget) break;
    out.push(entry);
  }
  return out.slice(0, budget);
}

/** The candidate's Radar category: explicit agent tag first, then derived. */
export function rowCategory(row: RadarCandidateInboxRow): RadarCategory | null {
  const normalized = normalizeRadarClassification({
    category: stringValue(readRaw(row, ["category"])) ?? reasonCategory(row),
    type: stringValue(readRaw(row, ["type"])) ?? row.entity_type,
    title: row.title,
    description: row.description,
    entityType: row.entity_type,
    placeType:
      stringValue(readRaw(row, ["place_type"])) ??
      stringValue(readRaw(row, ["quick_classification"])),
    venueType:
      stringValue(readRaw(row, ["venue_type"])) ??
      stringValue(readRaw(row, ["event_type"])),
    moveKind: stringValue(readRaw(row, ["move_kind"])),
    sequence: stringValue(readRaw(row, ["sequence"])),
    startsAt:
      stringValue(readRaw(row, ["startsAt"])) ??
      stringValue(readRaw(row, ["starts_at"])),
    tags: tags(row),
    sourcePayload: row.raw_payload,
  });
  if (normalized.category) return normalized.category;
  if (row.entity_type === "event") return "events";
  if (row.entity_type === "source") return null;
  const derived = normalizeRadarCategory(
    [row.title, row.description, ...tags(row)].filter(Boolean).join(" "),
  );
  if (derived) return derived;
  if (row.entity_type === "place") return "places";
  return null;
}

export function rowSource(row: RadarCandidateInboxRow): string | null {
  return (
    stringValue(readRaw(row, ["source"])) ??
    (isRecord(row.reason) ? stringValue(row.reason.source) : null)
  );
}

function reasonCategory(row: RadarCandidateInboxRow): string | null {
  return isRecord(row.reason) ? stringValue(row.reason.category) : null;
}

export function tags(row: RadarCandidateInboxRow): string[] {
  const reasonTags = isRecord(row.reason) && Array.isArray(row.reason.tags) ? row.reason.tags : [];
  const rawTags = readRaw(row, ["tags"]);
  const payloadTags = readRaw(row, ["payload", "tags"]);
  return unique([
    ...arrayValue(rawTags),
    ...arrayValue(payloadTags),
    ...arrayValue(reasonTags),
    row.entity_type,
  ]);
}

export function readRaw(row: RadarCandidateInboxRow, path: string[]): unknown {
  let current: unknown = row.raw_payload;
  for (const part of path) {
    if (Array.isArray(current)) {
      const index = Number(part);
      if (!Number.isInteger(index)) return undefined;
      current = current[index];
      continue;
    }
    if (!isRecord(current)) return undefined;
    current = current[part];
  }
  return current;
}

export function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function arrayValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

export function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
