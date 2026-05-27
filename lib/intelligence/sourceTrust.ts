import "server-only";

export type SourceTrustResult = {
  domain?: string;
  trustScore: number;
  sourceType: "trusted" | "neutral" | "low_trust" | "social" | "directory";
  classificationHint?: string;
  qualityFlags: string[];
};

const HIGH_TRUST: Record<string, string> = {
  "eater.com": "dining",
  "chicago.eater.com": "dining",
  "theinfatuation.com": "dining",
  "timeout.com": "culture",
  "chicagomag.com": "culture",
  "resy.com": "dining",
  "tock.com": "dining",
  "opentable.com": "dining",
  "do312.com": "events",
  "choosechicago.com": "culture",
  "chicago-reader.com": "culture",
  "chicagoreader.com": "culture",
  "ra.co": "events",
  "ticketmaster.com": "events",
  "eventbrite.com": "events",
  "notre-shop.com": "style",
  "svrn.com": "style",
  "saintalfred.com": "style",
  "rsvpgallery.com": "style",
  "hodinkee.com": "style",
  "articlesofstyle.com": "style",
  "gq.com": "style",
  "highsnobiety.com": "style",
};

export const HIGH_TRUST_DOMAINS = Object.keys(HIGH_TRUST);

const LOW_TRUST = [
  "instagram.com",
  "facebook.com",
  "youtube.com",
  "youtu.be",
  "tiktok.com",
  "houzz.com",
  "groupon.com",
  "yelp.com",
  "tripadvisor.com",
  "mapquest.com",
  "yellowpages.com",
  "near-me.com",
];

export function scoreSourceTrust(input: {
  url?: string;
  title?: string;
  snippet?: string;
  publishedDate?: string | null;
  age?: string | null;
}): SourceTrustResult {
  const domain = safeDomain(input.url);
  const root = rootDomain(domain);
  const haystack = `${input.title ?? ""} ${input.snippet ?? ""} ${input.url ?? ""}`.toLowerCase();
  const flags = new Set<string>();
  let trustScore = 0.52;
  let sourceType: SourceTrustResult["sourceType"] = "neutral";
  let classificationHint: string | undefined;

  const trusted = root ? HIGH_TRUST[root] ?? HIGH_TRUST[domain ?? ""] : undefined;
  if (trusted) {
    trustScore += 0.28;
    sourceType = "trusted";
    classificationHint = trusted;
  }

  if (domain && LOW_TRUST.some((d) => domain.includes(d))) {
    trustScore -= 0.32;
    sourceType = /instagram|facebook|youtube|tiktok/.test(domain)
      ? "social"
      : "low_trust";
    if (domain.includes("houzz.com")) classificationHint = "idea";
    if (domain.includes("youtube.com") || domain.includes("youtu.be")) {
      classificationHint = "idea";
    }
  }

  if (/instagram|facebook|tiktok|youtube|x\.com|twitter/.test(domain ?? "")) {
    flags.add("social_noise");
    if (/facebook/.test(domain ?? "")) flags.add("facebook_noise");
    if (!/(event|ticket|opening|venue|restaurant|store|market|gallery)/i.test(haystack)) {
      flags.add("instagram_noise");
      flags.add("weak_evidence");
    }
  }
  if (/coupon|groupon|directory|yellow pages|near me|tripadvisor|yelp|mapquest/i.test(haystack)) {
    flags.add("directory_spam");
    sourceType = "directory";
    trustScore -= 0.25;
  }
  if (/rugged masculine chicago|quiet luxury chicago/i.test(haystack)) {
    flags.add("too_literal");
    trustScore -= 0.22;
  }
  if (/alpha male|rugged maniac|manly men|sigma|bottle service|viral|hype/i.test(haystack)) {
    flags.add(/bottle service|viral|hype/i.test(haystack) ? "hype_noise" : "corny");
    trustScore -= 0.2;
  }
  if (/#\w+/.test(input.title ?? "") || /view all \d+ comments|profile photos|comments? and posts/i.test(haystack)) {
    flags.add("raw_comment");
    flags.add("title_unclear");
    trustScore -= 0.25;
  }
  if (/sold out|registration closed|event ended|past event|closed/i.test(haystack)) {
    flags.add("closed_event");
    trustScore -= 0.22;
  }
  if (input.publishedDate && isOlderThanDays(input.publishedDate, 90)) {
    flags.add("expired_event");
    trustScore -= 0.2;
  }
  if (input.age && /\b(20[0-2][0-4]|[2-9]\s+years?\s+ago)\b/i.test(input.age)) {
    flags.add("expired_event");
    trustScore -= 0.2;
  }

  return {
    domain,
    trustScore: clamp01(trustScore),
    sourceType,
    classificationHint,
    qualityFlags: Array.from(flags),
  };
}

export function sourceTrustSummary(
  rows: SourceTrustResult[],
): Record<string, unknown> {
  const flags = rows.flatMap((row) => row.qualityFlags);
  const domains = rows
    .map((row) => row.domain)
    .filter((domain): domain is string => Boolean(domain));
  return {
    average_trust:
      rows.length > 0
        ? Math.round(
            (rows.reduce((sum, row) => sum + row.trustScore, 0) / rows.length) * 100,
          ) / 100
        : null,
    trusted_count: rows.filter((row) => row.sourceType === "trusted").length,
    low_trust_count: rows.filter((row) =>
      ["low_trust", "social", "directory"].includes(row.sourceType),
    ).length,
    top_domains: Array.from(new Set(domains)).slice(0, 8),
    flags: Array.from(new Set(flags)).slice(0, 12),
  };
}

export function safeDomain(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function rootDomain(domain?: string): string | undefined {
  if (!domain) return undefined;
  const parts = domain.split(".");
  return parts.length <= 2 ? domain : parts.slice(-2).join(".");
}

function isOlderThanDays(iso: string, days: number): boolean {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return false;
  return Date.now() - time > days * 24 * 60 * 60 * 1000;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
