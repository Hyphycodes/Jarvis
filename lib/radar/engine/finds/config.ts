/**
 * Finds engine — source-brain config + classification + brain-tree types (per
 * jarvis-finds-engine-brain-tree.md). Finds is SPECIAL: it reuses the Product
 * Researcher + ProductDossier + surfaced_items payload + /find/[id] — the engine
 * is a curation BRAIN over the existing finds, NOT a new warehouse or re-render.
 *
 * Pure + dependency-light so it's unit-testable.
 */

export type FindSourceBrain =
  | "style"
  | "watches"
  | "gear"
  | "home"
  | "travel"
  | "hosting"
  | "fitness"
  | "creative_workflow"
  | "gift"
  | "need_scout"
  | "user_intent";

/** Visible lane is one (Finds); these are the internal sub-libraries for variety/dedup. */
export type FindSubLibrary =
  | "finds_clothing"
  | "finds_watches"
  | "finds_bags_accessories"
  | "finds_grooming_fragrance"
  | "finds_home"
  | "finds_gear"
  | "finds_travel"
  | "finds_fitness"
  | "finds_hosting"
  | "finds_books_media"
  | "finds_gifts"
  | "finds_workflow";

export type FindBudgetTier = "attainable" | "premium_realistic" | "aspirational" | "hold";

/** Map a source brain → its default sub-library (refined by subcategory keywords). */
const BRAIN_DEFAULT_SUB: Record<FindSourceBrain, FindSubLibrary> = {
  style: "finds_clothing",
  watches: "finds_watches",
  gear: "finds_gear",
  home: "finds_home",
  travel: "finds_travel",
  hosting: "finds_hosting",
  fitness: "finds_fitness",
  creative_workflow: "finds_workflow",
  gift: "finds_gifts",
  need_scout: "finds_gear",
  user_intent: "finds_gear",
};

const WATCH_RE = /\bwatch|chronograph|automatic|dive watch|dress watch|strap\b/i;
const BAG_RE = /\bbag|backpack|tote|wallet|belt|sunglasses|accessor/i;
const GROOM_RE = /\bfragrance|cologne|grooming|shav|skincare|scent\b/i;
const BOOK_RE = /\bbook|novel|magazine|vinyl|record\b/i;

export function classifyFindSubLibrary(input: {
  source_brain?: string | null;
  subcategory?: string | null;
  title?: string | null;
}): FindSubLibrary {
  const brain = (input.source_brain ?? "") as FindSourceBrain;
  const blob = [input.subcategory, input.title].filter(Boolean).join(" ").toLowerCase();
  // Subcategory keyword refinements that cross brain boundaries.
  if (WATCH_RE.test(blob)) return "finds_watches";
  if (GROOM_RE.test(blob)) return "finds_grooming_fragrance";
  if (BAG_RE.test(blob)) return "finds_bags_accessories";
  if (BOOK_RE.test(blob)) return "finds_books_media";
  return BRAIN_DEFAULT_SUB[brain] ?? "finds_gear";
}

/** Brand + product-family key for dedup (no Charvet wall). */
export function findFamilyKey(input: { brand?: string | null; subcategory?: string | null; title?: string | null }): string {
  const brand = normalize(input.brand ?? "");
  const family = normalize(input.subcategory ?? firstWords(input.title ?? "", 2));
  return [brand, family].filter(Boolean).join(":") || normalize(input.title ?? "");
}

export function normalizeFindTitle(title: string): string {
  return normalize(title);
}

function normalize(v: string): string {
  return v.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
}
function firstWords(s: string, n: number): string {
  return s.split(/\s+/).slice(0, n).join(" ");
}

// ── Shared brain-tree decision types ────────────────────────────────────────────

export type FindTruthAssessment = {
  product_confidence: number;
  source_quality: "official" | "retailer" | "trusted_review" | "partial" | "weak" | "unknown";
  price_confidence: number;
  image_confidence: number;
  supported_facts: string[];
  unsupported_claims: string[];
  needs_more_research: boolean;
};

export type FindBudgetAssessment = {
  budget_tier: FindBudgetTier;
  budget_fit: "comfortable" | "premium_but_ok" | "stretch" | "bad_fit" | "unknown";
  price_reasoning: string[];
  should_surface_background: boolean;
  requires_user_request: boolean;
};

export type FindUtilityAssessment = {
  utility_score: number;
  use_cases: string[];
  solves: string[];
  duplicates: string[];
  risks: string[];
};

export type FindSurface = "radar" | "reserve" | "suppress";
