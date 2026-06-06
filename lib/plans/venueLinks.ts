/**
 * Pure helpers for clickable venue deep-links. These need no geocoding or API
 * keys — Google Maps resolves a name/address text query, and reservation links
 * fall back to a reliable web search that surfaces the booking widget. Shared
 * by the plan page enrichment and the Details sub-page.
 */

export function mapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query.trim())}`;
}

export function parkingMapsUrl(query: string): string {
  return mapsSearchUrl(`parking near ${query.trim()}`);
}

export function telUrl(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

function reserveLabel(platform?: string): string {
  switch (platform) {
    case "opentable":
      return "Reserve · OpenTable";
    case "resy":
      return "Reserve · Resy";
    case "tock":
      return "Reserve · Tock";
    default:
      return "Reserve";
  }
}

/**
 * Resolve a clickable reservation link. Prefers a direct booking URL; otherwise,
 * for a known platform, sends to a web search that reliably surfaces the booking
 * page. Returns null for walk-in / website-only / unknown (no reserve action).
 */
export function reservationLink(input: {
  url?: string;
  platform?: string;
  venueQuery: string;
}): { url: string; label: string } | null {
  const { url, platform, venueQuery } = input;
  if (url && /^https?:\/\//i.test(url)) {
    return { url, label: reserveLabel(platform) };
  }
  if (
    platform &&
    platform !== "none" &&
    platform !== "walk_in" &&
    platform !== "website"
  ) {
    return {
      url: `https://www.google.com/search?q=${encodeURIComponent(
        `${venueQuery} reservation ${platform}`,
      )}`,
      label: reserveLabel(platform),
    };
  }
  return null;
}
