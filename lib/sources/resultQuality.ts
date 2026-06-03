export type ResultQualityIntent =
  | "events"
  | "dining"
  | "style"
  | "travel"
  | "shopping"
  | "places"
  | "culture"
  | "opportunity"
  | "unknown";

export type ResultQualityAssessment = {
  flags: string[];
  reasons: string[];
  hardReject: boolean;
};

const GENERIC_DIRECTORY_DOMAINS = [
  "yelp.com",
  "mapquest.com",
  "yellowpages.com",
  "tripadvisor.com",
  "groupon.com",
  "foursquare.com",
];

const HOTEL_AGGREGATOR_DOMAINS = [
  "trivago.com",
  "booking.com",
  "hotels.com",
  "expedia.com",
  "kayak.com",
  "priceline.com",
];

const CHAIN_RETAIL_DOMAINS = [
  "menswearhouse.com",
  "kohls.com",
  "macys.com",
  "jcpenney.com",
];

export function assessResultQuality(input: {
  title?: string | null;
  snippet?: string | null;
  url?: string | null;
  query?: string | null;
  category?: string | null;
  type?: string | null;
}): ResultQualityAssessment {
  const title = input.title ?? "";
  const snippet = input.snippet ?? "";
  const url = input.url ?? "";
  const domain = safeDomain(url);
  const root = rootDomain(domain);
  const category = (input.category ?? input.type ?? "unknown").toLowerCase();
  const intent = intentForCategory(category);
  const haystack = `${title} ${snippet} ${url}`.toLowerCase();
  const flags = new Set<string>();
  const reasons = new Set<string>();

  if (domainMatch(root, domain, GENERIC_DIRECTORY_DOMAINS)) {
    flags.add("generic_directory");
    flags.add("directory_spam");
    reasons.add("Generic directory source.");
  }

  if (domainMatch(root, domain, HOTEL_AGGREGATOR_DOMAINS) && intent !== "travel") {
    flags.add("hotel_aggregator_mismatch");
    reasons.add("Hotel/travel aggregator mismatch for this mission.");
  }

  if (domainMatch(root, domain, CHAIN_RETAIL_DOMAINS) && intent !== "shopping" && intent !== "style") {
    flags.add("chain_retail_mismatch");
    reasons.add("Generic chain retail result does not match the mission.");
  }

  if (root === "eventbrite.com" && isGenericEventbrite(url, title)) {
    flags.add("generic_event_page");
    reasons.add("Generic Eventbrite category/search page, not a specific event.");
  }

  if (root === "opentable.com" && /best|top|restaurants|list|101|near me/i.test(haystack) && !/\/r\//i.test(url)) {
    flags.add("generic_directory");
    reasons.add("Generic OpenTable list; useful only as a weak source lead.");
  }

  if (/things to do|best \d+|top \d+|ultimate guide|near me|directory|cheap hotels|hotel deals/i.test(haystack)) {
    flags.add("broad_seo_list");
    reasons.add("Broad SEO/listicle result.");
  }

  if (/tourist|tourism|tripadvisor|trivago|mapquest|yellow pages|men'?s wearhouse/i.test(haystack)) {
    flags.add("mission_mismatch");
    reasons.add("Source appears generic, tourist-facing, or mission-mismatched.");
  }

  const hardReject =
    flags.has("generic_directory") ||
    flags.has("hotel_aggregator_mismatch") ||
    flags.has("chain_retail_mismatch") ||
    flags.has("generic_event_page") ||
    flags.has("broad_seo_list") ||
    flags.has("mission_mismatch");

  return {
    flags: Array.from(flags),
    reasons: Array.from(reasons),
    hardReject,
  };
}

function intentForCategory(value: string): ResultQualityIntent {
  if (/event|music|culture|concert|show/.test(value)) return "events";
  if (/dining|restaurant|food|bar|cafe/.test(value)) return "dining";
  if (/style|menswear|watch|shopping|product/.test(value)) return value.includes("shopping") || value.includes("product") ? "shopping" : "style";
  if (/travel|hotel|lodging/.test(value)) return "travel";
  if (/place|outdoor|park|health|gym/.test(value)) return "places";
  if (/opportunity|real estate|ownership/.test(value)) return "opportunity";
  return "unknown";
}

function isGenericEventbrite(url: string, title: string): boolean {
  return /\/d\/|\/directory\/|\/b\/|\/things-to-do\/|\/search\//i.test(url) ||
    /events this weekend|events today|things to do|best events|eventbrite/i.test(title);
}

function domainMatch(root: string | null, domain: string | null, values: string[]): boolean {
  if (!root && !domain) return false;
  return values.some((value) => root === value || domain === value || domain?.endsWith(`.${value}`));
}

function safeDomain(url?: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function rootDomain(domain?: string | null): string | null {
  if (!domain) return null;
  const parts = domain.split(".");
  return parts.length <= 2 ? domain : parts.slice(-2).join(".");
}
