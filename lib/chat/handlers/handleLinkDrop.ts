import "server-only";

import { createObservation, updateObservation } from "@/lib/chat/observations";
import { judgeTasteFit } from "@/lib/chat/research/judgeTasteFit";
import type { ChatContextPacket } from "@/lib/chat/context/types";
import type {
  ChatAttachment,
  ChatChip,
  ChatIntakeResult,
  EntityType,
  ResearchSubjectResult,
  TasteFitJudgment,
} from "@/lib/chat/types";

type LinkKind = "place" | "event" | "article" | "product" | "social" | "other";
export type LinkChatAttachment = Extract<ChatAttachment, { type: "link" | "place" | "text" }> & {
  type: "link";
};

type LinkMetadata = {
  url: string;
  title: string;
  description: string;
  snippet: string;
  ok: boolean;
};

export async function handleLinkDrop(input: {
  userId: string;
  message: string;
  attachment: LinkChatAttachment;
  context: ChatContextPacket;
}): Promise<ChatIntakeResult> {
  const url = normalizeUrl(input.attachment.url ?? input.attachment.label ?? "");
  const metadata = url
    ? await fetchLinkMetadata(url)
    : fallbackMetadata(input.attachment.label ?? "Link", input.attachment.context ?? "");
  const kind = classifyLink(metadata);
  const subjectName = subjectNameFromMetadata(metadata);
  const research = subjectName
    ? buildResearchResult({ kind, metadata, subjectName })
    : null;
  const taste = await judgeTasteFit({
    context: input.context,
    research,
  });
  const observation = await createObservation({
    userId: input.userId,
    sourceType: "link",
    rawInputUrl: metadata.url || url,
    extractedText: extractedText(metadata),
    interpretedType: `link_${kind}`,
    confidence: metadata.ok ? confidenceForKind(kind) : 0.42,
    state: "recognized",
    metadata: {
      user_text: input.message,
      link_metadata: metadata,
      link_classification: kind,
      research,
      taste_fit: taste,
    },
  });

  await updateObservation({
    userId: input.userId,
    observationId: observation.id,
    metadataPatch: {
      link_metadata: metadata,
      link_classification: kind,
      research,
      taste_fit: taste,
    },
  });

  return {
    observationId: observation.id,
    research,
    taste,
    contextBlock: buildLinkContextBlock({
      observationId: observation.id,
      metadata,
      kind,
      research,
      taste,
    }),
    chips: chipsForLink({
      observationId: observation.id,
      metadata,
      kind,
      taste,
    }),
    state: "recognized",
  };
}

async function fetchLinkMetadata(url: string): Promise<LinkMetadata> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Jarvis/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    const html = await res.text();
    const title = firstMeta(html, [
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["'][^>]*>/i,
      /<title[^>]*>([\s\S]*?)<\/title>/i,
    ]);
    const description = firstMeta(html, [
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i,
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["'][^>]*>/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["'][^>]*>/i,
    ]);
    const snippet = htmlToText(html).slice(0, 900);
    return {
      url,
      title: cleanText(title) || url,
      description: cleanText(description),
      snippet,
      ok: true,
    };
  } catch {
    return {
      url,
      title: url,
      description: "",
      snippet: "",
      ok: false,
    };
  }
}

function fallbackMetadata(label: string, context: string): LinkMetadata {
  return {
    url: "",
    title: label || "Link",
    description: context,
    snippet: context,
    ok: false,
  };
}

function classifyLink(metadata: LinkMetadata): LinkKind {
  const haystack = `${metadata.url} ${metadata.title} ${metadata.description} ${metadata.snippet}`.toLowerCase();
  if (/\b(eventbrite|ticketmaster|tickets?|concert|festival|showtime|rsvp|doors open|calendar|lineup)\b/.test(haystack)) {
    return "event";
  }
  if (/\b(resy|opentable|tock|restaurant|bar|cafe|coffee|menu|reservation|google\.com\/maps|maps\.app\.goo\.gl)\b/.test(haystack)) {
    return "place";
  }
  if (/\b(product|shop|store|cart|sku|buy now|price|sale)\b/.test(haystack)) {
    return "product";
  }
  if (/\b(instagram\.com|tiktok\.com|youtube\.com|substack\.com|newsletter|creator|profile)\b/.test(haystack)) {
    return "social";
  }
  if (/\b(article|story|report|review|essay|news|interview)\b/.test(haystack)) {
    return "article";
  }
  return "other";
}

function buildResearchResult(input: {
  kind: LinkKind;
  metadata: LinkMetadata;
  subjectName: string;
}): ResearchSubjectResult {
  return {
    subjectName: input.subjectName,
    subjectType: subjectTypeForKind(input.kind),
    summary: [
      input.metadata.description,
      input.metadata.snippet,
    ].filter(Boolean).join(" | ").slice(0, 700) || `Linked page: ${input.metadata.title}`,
    sourceUrl: input.metadata.url || null,
    location: null,
    priceInfo: null,
    isCurrent: input.kind === "event" ? true : null,
    confidence: input.metadata.ok ? confidenceForKind(input.kind) : 0.42,
    raw: {
      link_kind: input.kind,
      title: input.metadata.title,
      description: input.metadata.description,
      url: input.metadata.url,
    },
  };
}

function chipsForLink(input: {
  observationId: string;
  metadata: LinkMetadata;
  kind: LinkKind;
  taste: TasteFitJudgment;
}): ChatChip[] {
  const payload = {
    observation_id: input.observationId,
    source_url: input.metadata.url,
  };
  if (
    (input.kind === "place" || input.kind === "event" || input.kind === "product") &&
    input.taste.role !== "pass"
  ) {
    return [
      {
        label: "Save to Radar",
        message: `Save ${input.metadata.title} to Radar.`,
        action_type: "save_to_radar",
        payload,
      },
      {
        label: "Find Similar",
        message: "Find me a few similar options with the same vibe.",
        action_type: "send_message",
        payload,
      },
    ];
  }
  if (input.kind === "social") {
    return [
      {
        label: "Monitor Source",
        message: "Monitor this source.",
        action_type: "monitor_source",
        payload,
      },
    ];
  }
  if (input.kind === "article") {
    return [
      {
        label: "Remember",
        message: "Remember this.",
        action_type: "remember",
        payload: {
          ...payload,
          memory_content: `${input.metadata.title}: ${input.metadata.description || input.metadata.url}`,
        },
      },
    ];
  }
  return [];
}

function buildLinkContextBlock(input: {
  observationId: string;
  metadata: LinkMetadata;
  kind: LinkKind;
  research: ResearchSubjectResult | null;
  taste: TasteFitJudgment;
}) {
  return [
    `Observation: ${input.observationId}`,
    `Type: link_${input.kind}`,
    `URL: ${input.metadata.url || "unknown"}`,
    `Title: ${input.metadata.title}`,
    `Summary: ${input.metadata.description || input.metadata.snippet || "No readable metadata."}`,
    `Research: ${input.research?.summary ?? "Not enough to research deeply."}`,
    `Taste fit: ${input.taste.fit} (${Math.round(input.taste.score * 100)}%) - ${input.taste.summary}`,
    "Action taken: link observation saved",
  ].join("\n");
}

function firstMeta(html: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1];
  }
  return "";
}

function htmlToText(html: string) {
  return cleanText(
    html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  );
}

function cleanText(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function subjectNameFromMetadata(metadata: LinkMetadata) {
  return cleanText(metadata.title)
    .replace(/\s+[|-]\s+.*$/, "")
    .slice(0, 120)
    .trim();
}

function subjectTypeForKind(kind: LinkKind): EntityType | "event" | "unknown" {
  if (kind === "place") return "place";
  if (kind === "event") return "event";
  if (kind === "product") return "product";
  if (kind === "social") return "source";
  if (kind === "article") return "document";
  return "unknown";
}

function confidenceForKind(kind: LinkKind) {
  if (kind === "place" || kind === "event") return 0.68;
  if (kind === "product" || kind === "social" || kind === "article") return 0.58;
  return 0.48;
}

function extractedText(metadata: LinkMetadata) {
  return [
    metadata.title,
    metadata.description,
    metadata.snippet,
  ].filter(Boolean).join("\n").slice(0, 3000) || null;
}

function normalizeUrl(value: string) {
  const trimmed = value.trim().replace(/[),.;!?]+$/, "");
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return "";
}
