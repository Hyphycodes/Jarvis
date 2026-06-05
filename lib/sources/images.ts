import { hasGooglePlaces, searchPlaceForEnrichment, getPlacePhotoUrl } from "@/lib/sources/googlePlaces";
import { hasBrave, imageSearch } from "@/lib/sources/brave";
import { hasSerpapi, searchProducts } from "@/lib/sources/serpapi";

/**
 * Real-photo resolver (Prompt 2C, Task 4).
 *
 * Fetches an image for a surfaced item from multiple sources in parallel and
 * picks the best — preferring the venue/event/product's own image over a
 * generic search result, and filtering out logos / maps / icons. Returns a
 * working URL or null (the clean-data law: never a broken URL or empty string;
 * the card renders a tasteful fallback for null).
 */
export type ImageCandidate = {
  url: string;
  source: string;
  /** Higher wins. Own-source imagery outranks generic image search. */
  priority: number;
  width?: number;
  height?: number;
};

export type ResolvedImage = { url: string; source: string } | null;

// Categories backed by a physical venue → Google Places photo is the best source.
const VENUE_CATEGORIES = new Set(["dining", "places", "culture", "moves"]);

// ── Pure helpers (unit-tested) ───────────────────────────────────────────────

export function isHttpUrl(url: string | null | undefined): url is string {
  return typeof url === "string" && /^https?:\/\//i.test(url);
}

/** Heuristic: obvious non-photos (logos, icons, map tiles, svg sprites). */
export function looksLikeLogoOrIcon(url: string): boolean {
  const u = url.toLowerCase();
  return (
    /\b(logo|favicon|sprite|avatar|badge|placeholder)\b/.test(u) ||
    /[/_-]icon[s]?[/_.-]/.test(u) ||
    /\/maps\/|staticmap|maps\.googleapis/.test(u) ||
    /\.svg(\?|#|$)/.test(u)
  );
}

/** Portrait/square images under 400px are likely thumbnails/logos — skip them.
 *  When dimensions are unknown, trust the image (don't over-filter). */
export function passesAspectFilter(c: { width?: number; height?: number }): boolean {
  if (c.width == null || c.height == null) return true;
  const maxDim = Math.max(c.width, c.height);
  const ratio = c.width / c.height; // <1 portrait, ~1 square, >1 landscape
  if (maxDim < 400 && ratio <= 1.1) return false;
  return true;
}

/** Pick the highest-priority valid candidate (logo/aspect filtered). */
export function pickBestImage(candidates: ImageCandidate[]): ResolvedImage {
  const best = candidates
    .filter((c) => isHttpUrl(c.url) && !looksLikeLogoOrIcon(c.url) && passesAspectFilter(c))
    .sort((a, b) => b.priority - a.priority)[0];
  return best ? { url: best.url, source: best.source } : null;
}

/** Extract og:image / twitter:image from raw HTML. Pure — exported for tests. */
export function parseOgImage(html: string): string | null {
  const trimmed = html.slice(0, 200_000);
  for (const prop of ["og:image:secure_url", "og:image", "twitter:image", "twitter:image:src"]) {
    const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, "i");
    const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, "i");
    const found = trimmed.match(re1)?.[1] ?? trimmed.match(re2)?.[1];
    if (found && isHttpUrl(found)) return found;
  }
  return null;
}

// ── IO source fetchers (best-effort, never throw) ────────────────────────────

async function fetchOgImage(pageUrl: string, timeoutMs = 4000): Promise<string | null> {
  if (!isHttpUrl(pageUrl)) return null;
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    const res = await fetch(pageUrl, {
      signal: ac.signal,
      headers: { "user-agent": "Mozilla/5.0 (compatible; JarvisBot/1.0)" },
    }).finally(() => clearTimeout(timer));
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("html")) return null;
    return parseOgImage(await res.text());
  } catch {
    return null;
  }
}

async function googlePlacesImage(
  name: string,
  city?: string | null,
  lat?: number | null,
  lng?: number | null,
): Promise<ImageCandidate[]> {
  try {
    const place = await searchPlaceForEnrichment({
      query: [name, city].filter(Boolean).join(" "),
      lat: lat ?? undefined,
      lng: lng ?? undefined,
    });
    const photoName = place?.photos?.[0]?.name;
    if (!photoName) return [];
    return [{ url: getPlacePhotoUrl({ photoName, maxWidthPx: 1080 }), source: "google_places", priority: 100 }];
  } catch {
    return [];
  }
}

async function serpProductImage(name: string): Promise<ImageCandidate[]> {
  try {
    const results = await searchProducts({ query: name, maxResults: 5 });
    const thumb = results.find((r) => isHttpUrl(r.thumbnail))?.thumbnail;
    return thumb ? [{ url: thumb, source: "serpapi", priority: 80 }] : [];
  } catch {
    return [];
  }
}

async function braveImageCandidates(query: string): Promise<ImageCandidate[]> {
  try {
    const results = await imageSearch({ query, count: 6 });
    return results
      .filter((r) => isHttpUrl(r.imageUrl))
      .slice(0, 4)
      .map((r) => ({ url: r.imageUrl, source: "brave_image", priority: 50, width: r.width, height: r.height }));
  } catch {
    return [];
  }
}

/**
 * Resolve the best real image for an item. Runs every applicable source in
 * parallel (total time ≈ slowest source, not the sum) and returns the winner
 * or null. Never throws.
 */
export async function resolveItemImage(input: {
  name: string;
  city?: string | null;
  category?: string | null;
  url?: string | null;
  lat?: number | null;
  lng?: number | null;
  /** Image already on the candidate (e.g. event provider image) — own-source. */
  existingImageUrl?: string | null;
}): Promise<ResolvedImage> {
  const category = (input.category ?? "").toLowerCase();
  const name = input.name?.trim();
  const tasks: Array<Promise<ImageCandidate[]>> = [];

  if (isHttpUrl(input.existingImageUrl)) {
    tasks.push(Promise.resolve([{ url: input.existingImageUrl, source: "payload", priority: 90 }]));
  }
  if (name && hasGooglePlaces() && VENUE_CATEGORIES.has(category)) {
    tasks.push(googlePlacesImage(name, input.city, input.lat, input.lng));
  }
  if (isHttpUrl(input.url)) {
    tasks.push(
      fetchOgImage(input.url).then((u) => (u ? [{ url: u, source: "og:image", priority: 70 }] : [])),
    );
  }
  if (name && category === "style" && hasSerpapi()) {
    tasks.push(serpProductImage(name));
  }
  if (name && hasBrave()) {
    tasks.push(braveImageCandidates([name, input.city].filter(Boolean).join(" ")));
  }

  if (tasks.length === 0) return null;
  const settled = await Promise.allSettled(tasks);
  const candidates = settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []));
  return pickBestImage(candidates);
}
