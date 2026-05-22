import "server-only";

import type { IndexedItem } from "@/lib/index/types";

export function purposeLabelForItem(item: IndexedItem): string {
  const payload = isRecord(item.rawPayload) ? item.rawPayload : {};
  const explicit = stringValue(payload.purpose_label);
  if (explicit) return explicit;

  const blob = `${item.category ?? ""} ${item.type} ${item.title} ${item.tags.join(" ")}`.toLowerCase();
  if (/gym|recovery|mobility|basketball|health|walk|sunlight/.test(blob)) return "Health reset";
  if (/golf|horse|trail|forest|outdoor|motocross/.test(blob)) return "Outdoor reset";
  if (/gun range|range session|skill|spanish|woodworking|camera|study/.test(blob)) return "Skill rep";
  if (/dj|crate|music|verse|hook|creative|hyphy|framing/.test(blob)) return "Creative fuel";
  if (/land|real estate|ownership|wholesale|comp review|investor/.test(blob)) return "Ownership lane";
  if (/menswear|watch|seiko|style|leather|boutique/.test(blob)) return "Taste development";
  if (/restaurant|dining|coffee|cigar|social|lounge|room/.test(blob)) return "Social room";
  if (/event|culture|jazz|gallery|reader|do312/.test(blob)) return "Culture signal";
  return "Useful move";
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
