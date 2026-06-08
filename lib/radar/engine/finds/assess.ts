/**
 * Find brain assessments (per jarvis-finds-engine-brain-tree.md). Deterministic
 * layers over the ProductDossier + Private Layer spend posture, before the LLM
 * council touches finalists. Pure + unit-tested.
 *
 * The big Finds discipline: keep fantasy luxury OUT of background Finds (hold it
 * unless the owner explicitly asked), and respect the declared spend posture.
 */

import type {
  FindTruthAssessment,
  FindBudgetAssessment,
  FindUtilityAssessment,
  FindBudgetTier,
} from "@/lib/radar/engine/finds/config";

export type AssessableFind = {
  title?: string | null;
  brand?: string | null;
  retailer?: string | null;
  price?: string | null;
  product_url?: string | null;
  image_url?: string | null;
  dossier_budget_tier?: string | null;
  value_for_income?: number | null;
  verdict_strength?: number | null;
  research_state?: string | null;
  userRequested?: boolean | null;
};

export type FindBudgetContext = {
  premiumThreshold?: number | null;
  aspirationalFrequency?: string | null; // rare_unless_requested | occasional | open_when_requested
  findsComfort?: string | null; // attainable | premium_realistic | aspirational
};

export function isHttpUrl(v: unknown): v is string {
  return typeof v === "string" && /^https?:\/\//i.test(v);
}

export function parseFindPrice(price: string | null | undefined): number | null {
  if (!price) return null;
  const m = /([\d,]+(?:\.\d+)?)/.exec(price.replace(/[^\d.,]/g, " "));
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

// ── Truth ────────────────────────────────────────────────────────────────────
export function assessFindTruth(f: AssessableFind): FindTruthAssessment {
  const hasUrl = isHttpUrl(f.product_url);
  const hasImage = isHttpUrl(f.image_url);
  const hasPrice = Boolean(f.price?.trim());
  const hasSeller = Boolean(f.retailer?.trim() || f.brand?.trim());

  const supported: string[] = [];
  const unsupported: string[] = [];
  if (hasUrl) supported.push("product_url"); else unsupported.push("no_product_url");
  if (hasImage) supported.push("image"); else unsupported.push("no_image");
  if (hasPrice) supported.push("price"); else unsupported.push("no_price");
  if (hasSeller) supported.push("retailer_or_brand");

  return {
    product_confidence: clamp01((hasUrl ? 0.35 : 0) + (hasImage ? 0.25 : 0) + (hasPrice ? 0.2 : 0) + (hasSeller ? 0.2 : 0)),
    source_quality: hasUrl && hasSeller ? "retailer" : hasUrl ? "partial" : "weak",
    price_confidence: hasPrice ? 0.85 : 0,
    image_confidence: hasImage ? 0.9 : 0,
    supported_facts: supported,
    unsupported_claims: unsupported,
    // A find is not buy-ready without a real product URL + image.
    needs_more_research: !hasUrl || !hasImage || f.research_state !== "ready",
  };
}

// ── Budget / spend ───────────────────────────────────────────────────────────
export function assessFindBudget(f: AssessableFind, ctx: FindBudgetContext = {}): FindBudgetAssessment {
  const threshold = ctx.premiumThreshold ?? 300;
  const price = parseFindPrice(f.price);
  const requested = Boolean(f.userRequested);
  const reasoning: string[] = [];

  let tier: FindBudgetTier;
  if (price == null) {
    tier = (normalizeTier(f.dossier_budget_tier) ?? "premium_realistic");
    reasoning.push("Price unknown — using the researcher's tier.");
  } else if (price <= 60) {
    tier = "attainable";
  } else if (price <= threshold) {
    tier = "premium_realistic";
  } else if (price <= threshold * 3) {
    tier = "aspirational";
    reasoning.push(`$${price} is above the $${threshold} premium threshold — aspirational.`);
  } else {
    tier = "hold";
    reasoning.push(`$${price} is fantasy-luxury territory — hold unless explicitly requested.`);
  }

  // Aspirational frequency gates background surfacing.
  const aspFreq = ctx.aspirationalFrequency ?? "rare_unless_requested";
  let should_surface_background = true;
  let requires_user_request = false;

  if (tier === "hold") {
    should_surface_background = requested;
    requires_user_request = !requested;
  } else if (tier === "aspirational") {
    should_surface_background = requested || aspFreq === "open_when_requested" ? requested : aspFreq === "occasional";
    requires_user_request = !should_surface_background;
    if (!should_surface_background) reasoning.push("Aspirational held — owner keeps aspirational rare unless asked.");
  }

  const budget_fit =
    tier === "attainable" ? "comfortable" : tier === "premium_realistic" ? "premium_but_ok" : tier === "aspirational" ? "stretch" : "bad_fit";

  return { budget_tier: tier, budget_fit, price_reasoning: reasoning, should_surface_background, requires_user_request };
}

// ── Utility ──────────────────────────────────────────────────────────────────
export function assessFindUtility(f: AssessableFind): FindUtilityAssessment {
  const value = typeof f.value_for_income === "number" ? f.value_for_income : null;
  const verdict = typeof f.verdict_strength === "number" ? f.verdict_strength : null;
  const utility_score = clamp01((value ?? 0.5) * 0.6 + (verdict ?? 0.5) * 0.4);
  return {
    utility_score,
    use_cases: [],
    solves: [],
    duplicates: [],
    risks: utility_score < 0.4 ? ["Low utility / value for the price."] : [],
  };
}

function normalizeTier(v: string | null | undefined): FindBudgetTier | null {
  if (!v) return null;
  const s = v.toLowerCase().replace(/[^a-z]+/g, "_");
  if (s === "attainable") return "attainable";
  if (s === "premium_realistic" || s === "premiumrealistic") return "premium_realistic";
  if (s === "aspirational") return "aspirational";
  if (s === "hold") return "hold";
  return null;
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
}
