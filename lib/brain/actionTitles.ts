import "server-only";

import { safeDomain } from "@/lib/intelligence/sourceTrust";
import type { IndexedItem } from "@/lib/index/types";

export type ActionTitleResult = {
  title: string;
  flags: string[];
};

const STOP_SUFFIXES = [
  "instagram",
  "facebook",
  "youtube",
  "ticketmaster",
  "eventbrite",
  "yelp",
  "tripadvisor",
  "houzz",
];

export function actionTitleForItem(item: IndexedItem): ActionTitleResult {
  const briefingTitle = item.briefing?.display_title;
  const raw = isRecord(item.rawPayload) ? item.rawPayload : {};
  const rawTitle =
    briefingTitle ??
    (typeof raw.lead_name === "string" ? raw.lead_name : undefined) ??
    item.title;
  const cleaned = cleanMoveTitle(rawTitle);
  const category = `${item.category ?? ""} ${item.type}`.toLowerCase();
  const domain = safeDomain(item.url);
  const flags: string[] = [];
  let title = cleaned;

  if (!title || looksLikeRawNoise(title)) {
    flags.push("title_unclear");
    title = fallbackTitle(category, domain);
  }

  if (literalInternal(title)) {
    flags.push("no_clear_move");
    title = fallbackTitle(category, domain);
  }

  return {
    title: clip(title, 44),
    flags,
  };
}

export function cleanMoveTitle(value: string | undefined): string {
  if (!value) return "";
  const stripped = value
    .replace(/local-radar:[^\s]+/gi, "")
    .replace(/seed:[^\s]+/gi, "")
    .replace(/Query:\s*"[^"]+"/gi, "")
    .replace(/View all \d+ comments.*$/gi, "")
    .replace(/\b[A-Za-z0-9._%+-]+\'s profile\b/gi, "")
    .replace(/#[\w-]+/g, "")
    .replace(/\s*[\|•·]\s*.+$/g, "")
    .replace(/\s+-\s+(Instagram|Facebook|YouTube|TikTok).*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped) return "";
  const withoutSuffix = STOP_SUFFIXES.reduce(
    (acc, suffix) => acc.replace(new RegExp(`\\b${suffix}\\b.*$`, "i"), "").trim(),
    stripped,
  );
  return titleCase(withoutSuffix || stripped);
}

function fallbackTitle(category: string, domain?: string): string {
  if (/restaurant|dining|food|cafe/.test(category)) return "Dining lead to check";
  if (/event|music|sports|culture/.test(category)) return "Event worth checking";
  if (/style|product|shopping|menswear|watch/.test(category)) return "Style lead to compare";
  if (/health|fitness|outdoors|activity/.test(category)) return "Low-friction move";
  if (/real_estate|land/.test(category)) return "Land lead to review";
  if (domain?.includes("articlesofstyle")) return "Style idea to hold";
  return "Move worth considering";
}

function looksLikeRawNoise(value: string): boolean {
  return (
    value.length > 90 ||
    /comments|profile|hashtag|rugged masculine|quiet luxury|near me/i.test(value) ||
    /[#|]/.test(value)
  );
}

function literalInternal(value: string): boolean {
  return /local-radar|seed:|query:|strategist/i.test(value);
}

function titleCase(value: string): string {
  return value
    .split(" ")
    .map((word, index) => {
      if (index > 0 && /^(and|or|the|of|for|in|at|to|a|an|with)$/i.test(word)) {
        return word.toLowerCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function clip(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1).trim()}…` : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
