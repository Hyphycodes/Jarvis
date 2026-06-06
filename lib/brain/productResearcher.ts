import "server-only";

import { hasAnthropic } from "@/lib/ai/anthropic";
import { generateStructured } from "@/lib/ai/structured";
import { hasTavily, searchWeb } from "@/lib/sources/tavily";
import { hasSerpapi, searchProducts, type SerpShoppingResult } from "@/lib/sources/serpapi";

/** Which internal specialist this find belongs to. Style is no longer a visible
 *  Radar tab — it's one of several brains that feed Finds. */
export type SourceBrain =
  | "style"
  | "gear"
  | "home"
  | "travel"
  | "hosting"
  | "fitness";

/** Whether a find is a real, presentable buyer recommendation yet. */
export type ResearchState = "researching" | "needs_enrichment" | "ready";

export type ProductPick = {
  name: string;
  brand: string | null;
  retailer: string | null;
  price: string | null;
  /** Real product image — grounded in a source row, never invented. */
  image_url: string | null;
  /** Direct product page — grounded in a source row, never invented. */
  product_url: string | null;
  rating: number | null;
  availability: string | null;
  key_specs: string[];
  pros: string[];
  cons: string[];
  taste_fit: string | null;
  /** Set true when product_url is a brand/retailer category page, not an exact
   *  product page — the UI labels it as a fallback. */
  url_is_fallback?: boolean;
};

export type ProductDossier = {
  mission_title: string;
  why_surfaced: string;
  source_brain: SourceBrain;
  subcategory: string | null;
  best_pick: ProductPick | null;
  alternatives: {
    premium?: ProductPick | null;
    budget?: ProductPick | null;
    different_style?: ProductPick | null;
  };
  avoid: string[];
  buy_if: string | null;
  skip_if: string | null;
  verdict_strength: number;
  confidence: number;
  research_state: ResearchState;
};

// ── Brain classification ───────────────────────────────────────────────────

const BRAIN_KEYWORDS: Array<[SourceBrain, RegExp]> = [
  ["fitness", /\b(running|trainer|gym|workout|lifting|recovery|court shoe|cleat|racket|racquet|yoga|mobility|hydration|sport|athletic)\b/i],
  ["travel", /\b(luggage|suitcase|carry-?on|packing|passport|travel|duffel|backpack for travel|toiletry|adapter|charger for trip)\b/i],
  ["home", /\b(shelf|shelving|closet system|furniture|lamp|lighting|storage|desk|chair|sofa|rug|decor|organiz|cable management|drawer|cabinet|nightstand)\b/i],
  ["hosting", /\b(cigar|ashtray|humidor|torch|barware|decanter|glassware|cookware|serving|grill|outdoor|host|whiskey stones|coaster|gift)\b/i],
  ["gear", /\b(camera|lens|nas|storage drive|ssd|microphone|audio|headphone|speaker|monitor|keyboard|laptop|tablet|drone|gimbal|tripod|nd filter|light|tech|tool|gpu|router)\b/i],
  ["style", /\b(shirt|tee|t-shirt|hoodie|sweater|knit|jacket|coat|overshirt|pant|trouser|jean|chino|shoe|sneaker|loafer|boot|belt|watch|fragrance|cologne|grooming|sunglasses|bag|wallet|jewelry|cashmere|linen|denim|wardrobe|outfit|polo)\b/i],
];

export function classifyBrain(mission: string, context?: string): SourceBrain {
  const hay = `${mission} ${context ?? ""}`;
  for (const [brain, re] of BRAIN_KEYWORDS) {
    if (re.test(hay)) return brain;
  }
  // Default to style — it's the broadest "things he wears/carries" bucket.
  return "style";
}

// ── Readiness gate ───────────────────────────────────────────────────────────

/**
 * A find is only a presentable buyer recommendation when its best pick carries
 * real, grounded data. Anything short of this stays in researching/enrichment.
 */
export function findIsReady(dossier: ProductDossier): boolean {
  const p = dossier.best_pick;
  if (!p) return false;
  const hasTitle = Boolean(p.name);
  const hasSeller = Boolean(p.retailer || p.brand);
  const hasPrice = Boolean(p.price);
  const hasImage = Boolean(p.image_url);
  const hasUrl = Boolean(p.product_url); // fallback URLs are allowed but flagged
  const hasDecision = Boolean(dossier.buy_if || dossier.skip_if);
  const hasReason = Boolean(dossier.why_surfaced);
  return hasTitle && hasSeller && hasPrice && hasImage && hasUrl && hasDecision && hasReason;
}

// ── Prompt ─────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Jarvis's PRODUCT RESEARCHER — a sharp, taste-driven buyer for one discerning owner. Given a "mission" (something to buy, source, upgrade, replace, carry, install, or gift), return ONE strong recommendation plus only-useful alternatives — grounded in REAL product data.

TASTE: refined, intentional, masculine, subtle luxury, durable, culturally aware — never flashy, never logo-loud, never mass-market filler.

DOMAIN PRIORITIES:
- Style (clothing/accessories/grooming/watches/fragrance/bags): fabric, drape, fit, color, season, styling range, quality over hype.
- Gear (tech/camera/audio/NAS/tools): reliability, future-proofing, compatibility, total cost of ownership, setup.
- Home (furniture/storage/lighting/decor): dimensions, material, durability, installation, visual + space fit.
- Travel (luggage/packing/chargers): portability, dimensions, carry-on fit, organization, durability.
- Hosting (cigars/barware/cookware/gifts): material, capacity, hosting value, durability, design fit.
- Fitness (training/sport/recovery): use-case fit, comfort, durability, performance benefit.

CRITICAL GROUNDING RULES:
- You are given SHOPPING_RESULTS (real products with title, retailer source, price, image, and a product URL) and optionally REVIEW_SOURCES (editorial articles).
- Pick your best_pick and alternatives FROM the SHOPPING_RESULTS whenever they exist. Copy name/brand/retailer/price/image_url/product_url/rating VERBATIM from the chosen row.
- NEVER invent or guess a product_url, image_url, price, retailer, brand, rating, or availability. If a field isn't in the source data, set it to null.
- Use REVIEW_SOURCES only to inform pros/cons/specs/taste_fit and which row to pick — not to fabricate purchase data.

OUTPUT per pick:
- key_specs: 3-6 concrete, decision-relevant facts. pros/cons: short and honest.
- taste_fit: one line on why it fits him (or null).
- avoid: specific traps. buy_if / skip_if: one crisp line each.
- verdict_strength (0..1): conviction it's worth surfacing. confidence (0..1): how solid the data is.
- subcategory: a short product type ("linen shirt", "carry-on", "NAS").

Return strict JSON:
{
  "mission_title": string,
  "why_surfaced": string,
  "subcategory": string|null,
  "best_pick": Pick|null,
  "alternatives": { "premium": Pick|null, "budget": Pick|null, "different_style": Pick|null },
  "avoid": string[],
  "buy_if": string|null,
  "skip_if": string|null,
  "verdict_strength": number,
  "confidence": number
}
Pick = { "name": string, "brand": string|null, "retailer": string|null, "price": string|null, "image_url": string|null, "product_url": string|null, "rating": number|null, "availability": string|null, "key_specs": string[], "pros": string[], "cons": string[], "taste_fit": string|null }`;

// ── Researcher ───────────────────────────────────────────────────────────────

export async function researchProduct(input: {
  /** The need, e.g. "linen shirts for summer", "better camera bag for filming". */
  mission: string;
  /** Why this surfaced + any taste/setup/closet context for grounding. */
  context?: string;
  /** A refinement to apply on a re-run ("darker", "under $300", "more old-school"). */
  refine?: string;
  /** Optional explicit brain; otherwise inferred from the mission. */
  sourceBrain?: SourceBrain;
  /** Optional budget hints parsed upstream. */
  budgetMin?: number;
  budgetMax?: number;
}): Promise<ProductDossier> {
  const mission = input.mission.trim();
  const sourceBrain = input.sourceBrain ?? classifyBrain(mission, input.context);

  const fallback = (state: ResearchState): ProductDossier => ({
    mission_title: mission,
    why_surfaced: input.context ?? "Requested.",
    source_brain: sourceBrain,
    subcategory: null,
    best_pick: null,
    alternatives: {},
    avoid: [],
    buy_if: null,
    skip_if: null,
    verdict_strength: 0,
    confidence: 0,
    research_state: state,
  });
  if (!hasAnthropic() || !mission) return fallback("needs_enrichment");

  // 1) Real shopping rows (grounding spine).
  const query = [mission, input.refine ?? ""].filter(Boolean).join(" ");
  let shopping: SerpShoppingResult[] = [];
  if (hasSerpapi()) {
    try {
      shopping = await searchProducts({
        query,
        priceMin: input.budgetMin,
        priceMax: input.budgetMax,
        maxResults: 10,
      });
    } catch {
      // best-effort
    }
  }

  // 2) Editorial / review layer (and fallback when no shopping rows).
  let reviewSources: Array<{ url: string; title: string; snippet: string }> = [];
  let answer: string | null = null;
  if (hasTavily()) {
    try {
      const res = await searchWeb({ query: `${query} best review buy`, maxResults: 6 });
      answer = res.answer ?? null;
      reviewSources = res.results.map((r) => ({ url: r.url, title: r.title, snippet: r.content.slice(0, 400) }));
    } catch {
      // best-effort
    }
  }

  // Allow-set of real URLs/images so we can null out anything the LLM invents.
  const allowedUrls = new Set<string>();
  const allowedImages = new Set<string>();
  for (const r of shopping) {
    const u = r.product_link || r.link;
    if (u) allowedUrls.add(u);
    if (r.thumbnail) allowedImages.add(r.thumbnail);
  }
  for (const s of reviewSources) if (s.url) allowedUrls.add(s.url);

  const shoppingForLlm = shopping.map((r) => ({
    title: r.title,
    retailer: r.source ?? null,
    price: r.price ?? (r.extracted_price != null ? `$${r.extracted_price}` : null),
    image_url: r.thumbnail ?? null,
    product_url: r.product_link || r.link || null,
    rating: r.rating ?? null,
    reviews: r.reviews ?? null,
  }));

  try {
    const raw = await generateStructured<RawDossier>({
      system: SYSTEM_PROMPT,
      prompt: JSON.stringify(
        {
          mission,
          source_brain: sourceBrain,
          refinement: input.refine ?? null,
          context: input.context ?? null,
          REVIEW_ANSWER: answer,
          SHOPPING_RESULTS: shoppingForLlm,
          REVIEW_SOURCES: reviewSources,
          instruction:
            "Pick the best product FROM SHOPPING_RESULTS (copy its name/retailer/price/image_url/product_url verbatim). Add only-useful alternatives. Never invent purchase data. Strict JSON.",
        },
        null,
        2,
      ),
      schemaName: "ProductDossier",
      temperature: 0.3,
      maxTokens: 2400,
    });
    return normalize(raw, mission, sourceBrain, input.context, allowedUrls, allowedImages);
  } catch (err) {
    console.error("[productResearcher] failed", err instanceof Error ? err.message : err);
    return fallback("needs_enrichment");
  }
}

// ── Normalization + grounding verification ───────────────────────────────────

type RawPick = Partial<ProductPick>;
type RawDossier = Partial<Omit<ProductDossier, "best_pick" | "alternatives">> & {
  best_pick?: RawPick | null;
  alternatives?: { premium?: RawPick | null; budget?: RawPick | null; different_style?: RawPick | null };
};

function normalize(
  raw: RawDossier,
  mission: string,
  sourceBrain: SourceBrain,
  context: string | undefined,
  allowedUrls: Set<string>,
  allowedImages: Set<string>,
): ProductDossier {
  const verifyPick = (p: RawPick | null | undefined) => normalizePick(p, allowedUrls, allowedImages);
  const dossier: ProductDossier = {
    mission_title: str(raw.mission_title) ?? mission,
    why_surfaced: str(raw.why_surfaced) ?? context ?? "",
    source_brain: sourceBrain,
    subcategory: str(raw.subcategory),
    best_pick: verifyPick(raw.best_pick),
    alternatives: {
      premium: verifyPick(raw.alternatives?.premium),
      budget: verifyPick(raw.alternatives?.budget),
      different_style: verifyPick(raw.alternatives?.different_style),
    },
    avoid: strArray(raw.avoid),
    buy_if: str(raw.buy_if),
    skip_if: str(raw.skip_if),
    verdict_strength: clamp01(raw.verdict_strength ?? 0),
    confidence: clamp01(raw.confidence ?? 0),
    research_state: "researching",
  };
  dossier.research_state = findIsReady(dossier) ? "ready" : "needs_enrichment";
  return dossier;
}

function normalizePick(
  p: RawPick | null | undefined,
  allowedUrls: Set<string>,
  allowedImages: Set<string>,
): ProductPick | null {
  if (!p || typeof p !== "object") return null;
  const name = str(p.name);
  if (!name) return null;

  // Grounding: only keep a product_url / image_url that came from a real source.
  let product_url = str(p.product_url);
  let url_is_fallback = false;
  if (product_url && !allowedUrls.has(product_url)) {
    // The model produced a URL we can't trace. Treat as fallback only if it's a
    // plausible brand/retailer root, otherwise drop it.
    if (/^https?:\/\/[^\s]+$/i.test(product_url) && isLikelyCategoryUrl(product_url)) {
      url_is_fallback = true;
    } else {
      product_url = null;
    }
  }
  let image_url = str(p.image_url);
  if (image_url && !allowedImages.has(image_url)) image_url = null;

  return {
    name,
    brand: str(p.brand),
    retailer: str(p.retailer),
    price: str(p.price),
    image_url,
    product_url,
    rating: typeof p.rating === "number" && Number.isFinite(p.rating) ? p.rating : null,
    availability: str(p.availability),
    key_specs: strArray(p.key_specs),
    pros: strArray(p.pros),
    cons: strArray(p.cons),
    taste_fit: str(p.taste_fit),
    url_is_fallback,
  };
}

/** A bare brand/retailer page (no deep product path/query) is acceptable as a
 *  clearly-labeled fallback; a fabricated deep link is not. */
function isLikelyCategoryUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const depth = u.pathname.split("/").filter(Boolean).length;
    return depth <= 2 && !u.search;
  } catch {
    return false;
  }
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim()) : [];
}
function clamp01(n: number): number {
  return Math.max(0, Math.min(1, typeof n === "number" ? n : 0));
}
