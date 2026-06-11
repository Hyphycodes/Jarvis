import "server-only";

import { createHash } from "crypto";
import { hasAnthropic } from "@/lib/ai/anthropic";
import { generateStructured } from "@/lib/ai/structured";
import { BRIEFING_EDITOR_SYSTEM_PROMPT } from "@/lib/brain/prompts/briefingEditorPrompt";
import {
  briefingQualityFlagSchema,
  isMajorQualityFlag,
  itemBriefingSchema,
  readBriefingFromPayload,
  readBriefingMetaFromPayload,
  type BriefingMeta,
  type ItemBriefing,
} from "@/lib/brain/briefingTypes";
import { actionTitleForItem } from "@/lib/brain/actionTitles";
import { scoreSourceTrust } from "@/lib/intelligence/sourceTrust";
import type { BrainContextPacket, BrainSelection, ScoredItem } from "@/lib/brain/types";
import type { IndexedItem } from "@/lib/index/types";

export type BriefingEditorInput = {
  context: BrainContextPacket;
  scored: ScoredItem;
  selection?: BrainSelection;
  criticReason?: string;
  maxAgeMs?: number;
  /** Reference canon block (YES/NO anchors) — lets copy name his references. */
  tasteCanonBlock?: string;
};

export type BriefingEditorResult = {
  briefing: ItemBriefing;
  meta: BriefingMeta;
  reused: boolean;
};

const DEFAULT_BRIEFING_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;

export async function editBriefing(
  input: BriefingEditorInput,
): Promise<BriefingEditorResult> {
  const item = input.scored.item;
  const fingerprint = sourceFingerprint(item);
  const existing = readBriefingFromPayload(item.rawPayload);
  const existingMeta = readBriefingMetaFromPayload(item.rawPayload);
  const maxAgeMs = input.maxAgeMs ?? DEFAULT_BRIEFING_MAX_AGE_MS;

  if (
    existing &&
    existingMeta?.source_fingerprint === fingerprint &&
    isFresh(existingMeta.generated_at, maxAgeMs)
  ) {
    return {
      briefing: existing,
      meta: existingMeta,
      reused: true,
    };
  }

  if (!hasAnthropic()) {
    const briefing = deterministicBriefing(input, "ANTHROPIC_API_KEY missing");
    return {
      briefing,
      meta: fallbackMeta(fingerprint, "ANTHROPIC_API_KEY missing"),
      reused: false,
    };
  }

  try {
    const raw = await generateStructured<unknown>({
      system: BRIEFING_EDITOR_SYSTEM_PROMPT,
      prompt: renderBriefingPrompt(input),
      schemaName: "ItemBriefing",
      temperature: 0.25,
    });
    const parsed = itemBriefingSchema.safeParse(raw);
    if (!parsed.success) {
      console.error("[briefing.editor] schema mismatch", {
        itemId: item.id,
        reason: parsed.error.message,
      });
      const briefing = deterministicBriefing(input, "briefing schema invalid");
      return {
        briefing,
        meta: fallbackMeta(fingerprint, "briefing schema invalid"),
        reused: false,
      };
    }
    return {
      briefing: parsed.data,
      meta: {
        source_fingerprint: fingerprint,
        generated_at: new Date().toISOString(),
        fallback_used: false,
      },
      reused: false,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error("[briefing.editor] generation failed", {
      itemId: item.id,
      reason,
      error,
    });
    const briefing = deterministicBriefing(input, `briefing error: ${reason}`);
    return {
      briefing,
      meta: fallbackMeta(fingerprint, `briefing error: ${reason}`),
      reused: false,
    };
  }
}

export function deterministicBriefing(
  input: BriefingEditorInput,
  reason = "deterministic fallback",
): ItemBriefing {
  const item = input.scored.item;
  const raw = isRecord(item.rawPayload) ? item.rawPayload : {};
  const sourceTitle =
    typeof raw.source_title === "string" ? cleanTitle(raw.source_title) : "";
  const title = cleanTitle(item.title || sourceTitle || "Untitled");
  const moveTitle = actionTitleForItem(item);
  const displayTitle = moveTitle.title || title || "Untitled";
  const description = clip(stripInternalText(item.description ?? item.subtitle ?? ""), 180);
  const tags = cleanTags(item.tags);
  const flags = uniqFlags([...inferQualityFlags(item), ...moveTitle.flags]);
  const confidence = clamp01(input.selection?.confidence ?? item.score ?? input.scored.score);
  const lowQuality = flags.some(isMajorQualityFlag);
  const suggested = lowQuality
    ? "discovered"
    : confidence >= 0.65
      ? input.selection?.destination === "holding"
        ? "holding"
        : "radar"
      : "holding";
  const action = lowQuality
    ? flags.includes("not_actionable")
      ? "ignore"
      : "research"
    : suggested === "holding"
      ? "hold"
      : typeof raw.plan_slug === "string"
        ? "plan"
        : "save";

  return {
    display_title: clip(displayTitle, 120),
    display_category: clip(cleanCategory(item.category ?? item.type), 48),
    one_line:
      description ||
      (lowQuality ? "Interesting signal, but the evidence is thin." : "Worth a closer look."),
    jarvis_take: clip(lowQuality
      ? "Good signal, weak evidence. Hold it until a clearer source confirms the fit."
      : holdingTone(suggested, input.selection?.displayAngle ?? input.scored.reasons[0]), 360),
    why_it_matters:
      clip(stripInternalText(input.selection?.reason ?? input.scored.reasons[0] ?? ""), 360) ||
      "It lines up with the current taste profile without demanding a big commitment.",
    why_now: clip(stripInternalText(input.scored.reasons[1] ?? ""), 220),
    best_next_action: action,
    confidence,
    confidence_label: confidence >= 0.74 ? "high" : confidence >= 0.5 ? "medium" : "low",
    effort_level: inferEffort(item.tags),
    spending_posture: inferSpend(item.tags),
    suggested_destination: suggested,
    quality_flags: flags,
    evidence_summary: clip(
      sourceTitle || item.url
        ? `Source evidence from ${safeDomain(item.url) ?? "the original source"}${sourceTitle ? `: ${sourceTitle}` : ""}.`
        : reason,
      360,
    ),
    cleaned_tags: tags,
  };
}

export function sourceFingerprint(item: IndexedItem): string {
  const raw = isRecord(item.rawPayload) ? item.rawPayload : {};
  const payload = {
    title: item.title,
    subtitle: item.subtitle,
    description: item.description,
    url: item.url,
    sourceId: item.sourceId,
    sourceTitle: raw.source_title,
    leadName: raw.lead_name,
    tags: item.tags,
  };
  return createHash("sha1").update(JSON.stringify(payload)).digest("hex");
}

function renderBriefingPrompt(input: BriefingEditorInput): string {
  const item = input.scored.item;
  const raw = isRecord(item.rawPayload) ? item.rawPayload : {};
  return JSON.stringify(
    {
      owner_context: {
        now: input.context.now,
        home: { city: input.context.homeCity, state: input.context.homeState },
        current_focus: input.context.founder.currentFocus,
        vibe: input.context.founder.vibeKeywords,
        avoid: input.context.founder.avoidKeywords,
        dealbreakers: input.context.founder.dealbreakers,
        reference_canon: input.tasteCanonBlock || undefined,
        work_schedule:
          "Weeknights are limited energy. Practical after-work ideas should beat high-effort ones.",
      },
      candidate: {
        id: item.id,
        title: item.title,
        subtitle: item.subtitle,
        description: item.description,
        category: item.category,
        type: item.type,
        source: item.source,
        source_id: item.sourceId,
        url: item.url,
        starts_at: item.startsAt,
        expires_at: item.expiresAt,
        location: item.locationName ?? item.address,
        tags: item.tags,
        reasons: item.reasons,
        score: input.scored.score,
        destination: item.destination,
        status: item.status,
      },
      source_evidence: {
        title: raw.source_title,
        url: raw.source_url ?? item.url,
        snippet: item.description,
        domain: safeDomain(item.url),
        lead_name: raw.lead_name,
        published_date: raw.published_date,
        age: raw.age,
      },
      internal_judgment: {
        strategist_lane: raw.lane_id,
        query_group: raw.query_group,
        query: raw.query,
        curator_selection: input.selection ?? null,
        critic_reason: input.criticReason,
      },
      instructions: [
        "Return only user-facing copy.",
        "Do not repeat raw query text or lane ids.",
        "Downgrade source-thin or literal search-result candidates.",
        "If the result belongs in Holding, make that clear.",
        "Active Radar is only for decision-ready items.",
      ],
    },
    null,
    2,
  );
}

function fallbackMeta(fingerprint: string, reason: string): BriefingMeta {
  return {
    source_fingerprint: fingerprint,
    generated_at: new Date().toISOString(),
    fallback_used: true,
    fallback_reason: reason,
  };
}

function inferQualityFlags(item: IndexedItem): ItemBriefing["quality_flags"] {
  const raw = isRecord(item.rawPayload) ? item.rawPayload : {};
  const haystack = `${item.title} ${item.subtitle ?? ""} ${item.description ?? ""} ${item.url ?? ""}`.toLowerCase();
  const flags = new Set<ItemBriefing["quality_flags"][number]>();
  const domain = safeDomain(item.url)?.toLowerCase() ?? "";
  const sourceTrust = scoreSourceTrust({
    url: item.url,
    title: item.title,
    snippet: item.description,
    publishedDate:
      typeof raw.published_date === "string" ? raw.published_date : null,
    age: typeof raw.age === "string" ? raw.age : null,
  });
  for (const flag of sourceTrust.qualityFlags) {
    if (isBriefingFlag(flag)) flags.add(flag);
  }

  if (/instagram\.com|tiktok\.com|facebook\.com|x\.com|twitter\.com/.test(domain)) {
    flags.add("instagram_noise");
    flags.add("social_noise");
  }
  if (/#\w+/.test(item.title) || /comments?\s+and\s+posts|profile\s+photos/i.test(item.title)) {
    flags.add("instagram_noise");
    flags.add("raw_comment");
  }
  if (/near me|coupon|groupon|yelp|tripadvisor|directory|best\s+\d+|top\s+\d+/i.test(haystack)) {
    flags.add("seo_junk");
  }
  if (typeof raw.query === "string" && literalOverlap(item.title, raw.query) >= 0.6) {
    flags.add("too_literal");
  }
  if (!raw.lead_name && item.tags.includes("web-result")) {
    flags.add("weak_evidence");
  }
  if ((item.description ?? "").length < 40 && !item.locationName) {
    flags.add("weak_evidence");
  }
  if (/generic|ultimate guide|things to do|everything you need/i.test(haystack)) {
    flags.add("generic");
  }
  if (!item.url && !item.locationName && !item.startsAt) {
    flags.add("not_actionable");
  }
  return Array.from(flags);
}

function isBriefingFlag(flag: string): flag is ItemBriefing["quality_flags"][number] {
  return briefingQualityFlagSchema.safeParse(flag).success;
}

function uniqFlags(
  flags: string[],
): ItemBriefing["quality_flags"] {
  return Array.from(new Set(flags)).filter(isBriefingFlag);
}

function cleanTags(tags: string[]): string[] {
  return tags
    .filter((tag) => !isInternalTag(tag))
    .map((tag) => tag.replace(/[_:]/g, " ").trim())
    .filter(Boolean)
    .slice(0, 8);
}

function isInternalTag(tag: string): boolean {
  return (
    tag.startsWith("lane:") ||
    tag.startsWith("seed:") ||
    tag.startsWith("mode:") ||
    tag === "strategist-lane" ||
    tag === "local-radar" ||
    tag === "web-result" ||
    tag === "article-lead" ||
    tag.includes(":")
  );
}

function holdingTone(destination: string, angle?: string): string {
  const clean = stripInternalText(angle ?? "");
  if (destination === "holding") {
    return clean
      ? `Good signal, not urgent. ${clean}`
      : "Good signal, not urgent. Worth keeping in the back room.";
  }
  return clean || "Worth attention now.";
}

function stripInternalText(value: string): string {
  return value
    .replace(/Strategist lane:\s*[^.]+\.?/gi, "")
    .replace(/Query:\s*"[^"]+"\s*/gi, "")
    .replace(/\bseed:[\w:-]+\b/gi, "")
    .replace(/\blane:[\w:-]+\b/gi, "")
    .replace(/\blocal-radar:[\w:-]+\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanTitle(value: string): string {
  const stripped = stripInternalText(value)
    .replace(/\s*[\|•·—]\s*Instagram.*$/i, "")
    .replace(/\s*-\s*Instagram.*$/i, "")
    .replace(/\s*[\|•·—]\s*[^|•·—]{2,30}$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped) return "";
  return stripped
    .split(" ")
    .map((word) =>
      /^(and|or|the|of|for|in|at|to|a)$/i.test(word)
        ? word.toLowerCase()
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ")
    .replace(/^([a-z])/, (m) => m.toUpperCase());
}

function cleanCategory(value: string): string {
  return value.replace(/[_-]/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function inferEffort(tags: string[]): ItemBriefing["effort_level"] {
  if (tags.some((t) => ["high-effort", "all-day", "travel"].includes(t))) return "high";
  if (tags.some((t) => ["event", "ticketed", "paid"].includes(t))) return "medium";
  return "low";
}

function inferSpend(tags: string[]): ItemBriefing["spending_posture"] {
  if (tags.includes("high")) return "high";
  if (tags.includes("paid") || tags.includes("ticketed")) return "paid";
  if (tags.includes("free")) return "free";
  return "unknown";
}

function literalOverlap(title: string, query: string): number {
  const titleWords = new Set(words(title));
  const queryWords = words(query).filter((word) => word.length > 4);
  if (queryWords.length === 0) return 0;
  const shared = queryWords.filter((word) => titleWords.has(word)).length;
  return shared / queryWords.length;
}

function words(value: string): string[] {
  return value.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

function isFresh(iso: string | undefined, maxAgeMs: number): boolean {
  if (!iso) return false;
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return false;
  return Date.now() - time <= maxAgeMs;
}

function safeDomain(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clip(value: string, max: number): string {
  if (value.length <= max) return value;
  return value.slice(0, Math.max(0, max - 1)).trimEnd() + "…";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
