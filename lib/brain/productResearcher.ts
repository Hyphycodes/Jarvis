import "server-only";

import { hasAnthropic } from "@/lib/ai/anthropic";
import { generateStructured } from "@/lib/ai/structured";
import { hasTavily, searchWeb } from "@/lib/sources/tavily";

export type ProductPick = {
  name: string;
  price: string | null;
  where_to_buy: string | null;
  url: string | null;
  key_specs: string[];
  pros: string[];
  cons: string[];
  taste_fit: string | null;
};

export type ProductDossier = {
  mission_title: string;
  why_surfaced: string;
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
};

const SYSTEM_PROMPT = `You are Jarvis's PRODUCT RESEARCHER — a sharp, taste-driven buyer for one discerning owner. Given a "mission" (something to buy, source, upgrade, replace, carry, install, or gift), research real options and return ONE strong recommendation plus only-useful alternatives.

TASTE: refined, intentional, masculine, subtle luxury, durable, culturally aware — never flashy, never logo-loud, never mass-market filler.

DOMAIN PRIORITIES:
- Clothing/accessories: fabric, drape, fit, color, season, styling range, quality over hype.
- Tech/gear: reliability, future-proofing, compatibility with his existing setup, total cost of ownership.
- Home/storage/furniture: dimensions, material, durability, installation, visual fit.
- Creative equipment: real workflow usefulness, portability, image/audio quality, compatibility.

RULES:
- ONE best pick. Add premium/budget/different-style alternatives ONLY when genuinely useful — never a generic list.
- Ground name/price/where_to_buy/url in the provided sources. NEVER invent a URL or a price; use null if unknown.
- key_specs: 3-6 concrete, decision-relevant facts. pros/cons: short and honest.
- avoid: specific traps ("skip the logo-heavy versions", "avoid bonded leather").
- buy_if / skip_if: one crisp line each.
- verdict_strength (0..1): conviction this is worth surfacing/buying. confidence (0..1): how solid the research is.

Return strict JSON:
{
  "mission_title": string,
  "why_surfaced": string,
  "best_pick": { "name": string, "price": string|null, "where_to_buy": string|null, "url": string|null, "key_specs": string[], "pros": string[], "cons": string[], "taste_fit": string|null } | null,
  "alternatives": { "premium": Pick|null, "budget": Pick|null, "different_style": Pick|null },
  "avoid": string[],
  "buy_if": string|null,
  "skip_if": string|null,
  "verdict_strength": number,
  "confidence": number
}`;

export async function researchProduct(input: {
  /** The need, e.g. "linen shirts for summer", "better camera bag for filming". */
  mission: string;
  /** Why this surfaced + any taste/setup context for grounding. */
  context?: string;
  /** A refinement to apply on a re-run ("darker", "under $300", "more old-school"). */
  refine?: string;
}): Promise<ProductDossier> {
  const mission = input.mission.trim();
  const fallback = (reason: string): ProductDossier => ({
    mission_title: mission,
    why_surfaced: input.context ?? "Requested.",
    best_pick: null,
    alternatives: {},
    avoid: [],
    buy_if: null,
    skip_if: null,
    verdict_strength: 0,
    confidence: 0,
  });
  if (!hasAnthropic() || !mission) return fallback("no-llm");

  let sources: Array<{ url: string; title: string; snippet: string }> = [];
  let answer: string | null = null;
  if (hasTavily()) {
    try {
      const q = [mission, input.refine ?? "", "best review buy"].filter(Boolean).join(" ");
      const res = await searchWeb({ query: q, maxResults: 6 });
      answer = res.answer ?? null;
      sources = res.results.map((r) => ({ url: r.url, title: r.title, snippet: r.content.slice(0, 500) }));
    } catch {
      // best-effort
    }
  }

  try {
    const raw = await generateStructured<ProductDossier>({
      system: SYSTEM_PROMPT,
      prompt: JSON.stringify(
        {
          mission,
          refinement: input.refine ?? null,
          context: input.context ?? null,
          answer,
          sources,
          instruction: "Research the mission and return ONE best pick + only-useful alternatives. Strict JSON.",
        },
        null,
        2,
      ),
      schemaName: "ProductDossier",
      temperature: 0.3,
      maxTokens: 2200,
    });
    return normalize(raw, mission, input.context);
  } catch (err) {
    console.error("[productResearcher] failed", err instanceof Error ? err.message : err);
    return fallback("error");
  }
}

function normalize(raw: ProductDossier, mission: string, context?: string): ProductDossier {
  return {
    mission_title: str(raw.mission_title) ?? mission,
    why_surfaced: str(raw.why_surfaced) ?? context ?? "",
    best_pick: normalizePick(raw.best_pick),
    alternatives: {
      premium: normalizePick(raw.alternatives?.premium),
      budget: normalizePick(raw.alternatives?.budget),
      different_style: normalizePick(raw.alternatives?.different_style),
    },
    avoid: strArray(raw.avoid),
    buy_if: str(raw.buy_if),
    skip_if: str(raw.skip_if),
    verdict_strength: clamp01(raw.verdict_strength ?? 0),
    confidence: clamp01(raw.confidence ?? 0),
  };
}

function normalizePick(p: ProductPick | null | undefined): ProductPick | null {
  if (!p || typeof p !== "object") return null;
  const name = str(p.name);
  if (!name) return null;
  return {
    name,
    price: str(p.price),
    where_to_buy: str(p.where_to_buy),
    url: str(p.url),
    key_specs: strArray(p.key_specs),
    pros: strArray(p.pros),
    cons: strArray(p.cons),
    taste_fit: str(p.taste_fit),
  };
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
