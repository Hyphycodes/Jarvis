import "server-only";
import { hasSerpapi, searchProducts } from "@/lib/sources/serpapi";

export type SourcingResult = {
  gap: string; // e.g. "shoes"
  options: Array<{
    title: string;
    price: string | null;
    link: string | null;
    source: string | null;
    rating: number | null;
  }>;
};

export async function sourceWardrobeGaps(input: {
  gaps: string[];
  formality: string;
  activityTag?: string;
  city?: string;
}): Promise<SourcingResult[]> {
  if (!hasSerpapi() || input.gaps.length === 0) return [];

  const results: SourcingResult[] = [];

  for (const gap of input.gaps.slice(0, 3)) {
    // max 3 gaps
    try {
      const query = buildQuery(gap, input.formality, input.activityTag);
      const products = await searchProducts({
        query,
        location: input.city
          ? `${input.city}, Illinois, United States`
          : "Chicago, Illinois, United States",
        maxResults: 4,
      });
      results.push({
        gap,
        options: products.slice(0, 3).map((p) => ({
          title: p.title,
          price: p.price ?? null,
          link: p.product_link ?? p.link ?? null,
          source: p.source ?? null,
          rating: p.rating ?? null,
        })),
      });
    } catch {
      // SerpAPI not configured or query failed — skip this gap.
    }
  }

  return results;
}

function buildQuery(gap: string, formality: string, activityTag?: string): string {
  const formalityHint =
    formality === "formal"
      ? "dress"
      : formality === "business"
        ? "business"
        : formality === "smart-casual"
          ? "smart casual"
          : "casual";

  const activityHint = activityTag && activityTag !== "casual" ? ` ${activityTag}` : "";
  return `men's ${formalityHint}${activityHint} ${gap}`;
}
